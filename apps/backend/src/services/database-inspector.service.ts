import pg from 'pg';
import mysql from 'mysql2/promise';
import { Redis } from 'ioredis';
import net from 'node:net';
import { prisma } from '../db.js';
import { dockerService } from './docker.service.js';
import type {
  DatabaseCatalog,
  DatabaseTable,
  DatabaseColumn,
  DatabaseForeignKey,
  DatabaseIndex,
  DatabaseDependency,
  RedisKeyInfo,
  RedisServerMetrics,
} from '@stackorbit/shared';

export interface DatabaseConnectionInfo {
  serviceId: string;
  containerName: string;
  type: 'postgres' | 'mysql' | 'mariadb' | 'redis';
  host: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
}

export class DatabaseInspectorService {
  /**
   * Extrai dados de conexão a partir do registro do serviço e variáveis de ambiente.
   */
  public async resolveConnectionInfo(serviceId: string): Promise<DatabaseConnectionInfo> {
    const service = await prisma.service.findUnique({ where: { id: serviceId } });
    if (!service) {
      throw new Error('Serviço de banco de dados não encontrado.');
    }

    const img = (service.image || '').toLowerCase();
    const envVars: Record<string, string> = {};

    if (service.envVars) {
      service.envVars
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'))
        .forEach((line) => {
          const idx = line.indexOf('=');
          if (idx !== -1) {
            envVars[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
          }
        });
    }

    // No Linux em produção na rede Docker proxy-net, o host é o containerName
    // Em dev local, tenta containerName ou 127.0.0.1
    const host = process.env.NODE_ENV === 'production' || process.platform === 'linux'
      ? service.containerName
      : '127.0.0.1';

    if (img.includes('postgres')) {
      return {
        serviceId: service.id,
        containerName: service.containerName,
        type: 'postgres',
        host,
        port: service.internalPort || 5432,
        user: envVars.POSTGRES_USER || 'postgres',
        password: envVars.POSTGRES_PASSWORD || 'Postgres2026!Sec',
        database: envVars.POSTGRES_DB || 'postgres',
      };
    }

    if (img.includes('mariadb') || img.includes('mysql')) {
      return {
        serviceId: service.id,
        containerName: service.containerName,
        type: img.includes('mariadb') ? 'mariadb' : 'mysql',
        host,
        port: service.internalPort || 3306,
        user: envVars.MARIADB_USER || envVars.MYSQL_USER || 'root',
        password:
          envVars.MARIADB_PASSWORD ||
          envVars.MARIADB_ROOT_PASSWORD ||
          envVars.MYSQL_PASSWORD ||
          envVars.MYSQL_ROOT_PASSWORD ||
          '',
        database: envVars.MARIADB_DATABASE || envVars.MYSQL_DATABASE || 'app_database',
      };
    }

    if (img.includes('redis')) {
      return {
        serviceId: service.id,
        containerName: service.containerName,
        type: 'redis',
        host,
        port: service.internalPort || 6379,
        password: envVars.REDIS_PASSWORD || undefined,
      };
    }

    throw new Error(`Tipo de banco de dados não suportado para a imagem: ${service.image}`);
  }

  // Cache de status de conectividade TCP direta (evita timeouts repetidos de 2.5s)
  private tcpStatusCache = new Map<string, { reachable: boolean; lastChecked: number }>();

  private async isTcpReachable(host: string, port: number, cacheKey: string): Promise<boolean> {
    const cached = this.tcpStatusCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.lastChecked < 60_000) {
      return cached.reachable;
    }

    // Teste ultrarrápido com socket TCP (timeout 150ms)
    const reachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(150);
      socket.on('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve(false);
      });
      socket.on('error', () => {
        socket.destroy();
        resolve(false);
      });
      socket.connect(port, host);
    });

    this.tcpStatusCache.set(cacheKey, { reachable, lastChecked: now });
    return reachable;
  }

  // ==========================================
  // EXECUTOR RESILIENTE POSTGRESQL (TCP + DOCKER EXEC)
  // ==========================================
  public async queryPostgres(
    conn: DatabaseConnectionInfo,
    sql: string,
    targetDb?: string
  ): Promise<any[]> {
    const db = targetDb || conn.database || 'postgres';
    const user = conn.user || 'postgres';
    const cacheKey = `${conn.host}:${conn.port}`;

    const canTcp = await this.isTcpReachable(conn.host, conn.port, cacheKey);
    if (canTcp) {
      try {
        const client = new pg.Client({
          host: conn.host,
          port: conn.port,
          user,
          password: conn.password,
          database: db,
          connectionTimeoutMillis: 1200,
        });

        await client.connect();
        try {
          const res = await client.query(sql);
          return res.rows || [];
        } finally {
          await client.end().catch(() => {});
        }
      } catch {
        this.tcpStatusCache.set(cacheKey, { reachable: false, lastChecked: Date.now() });
        return await this.queryPostgresViaDocker(conn, sql, db, user);
      }
    }

    return await this.queryPostgresViaDocker(conn, sql, db, user);
  }

  private async queryPostgresViaDocker(
    conn: DatabaseConnectionInfo,
    sql: string,
    db: string,
    user: string
  ): Promise<any[]> {
    const cleanSql = sql.replace(/;+\s*$/, '');
    // Encapsula o resultado em JSON para deserialização 100% tipada
    const jsonSql = `SELECT COALESCE(json_agg(t), '[]'::json) FROM (${cleanSql}) t;`;

    const res = await dockerService.execCommand(conn.containerName, [
      'psql',
      '-U',
      user,
      '-d',
      db,
      '-t',
      '-A',
      '-c',
      jsonSql,
    ]);

    if (res.exitCode !== 0) {
      // Se der erro de sintaxe ou coluna, tenta psql direto para pegar o erro real
      const direct = await dockerService.execCommand(conn.containerName, [
        'psql',
        '-U',
        user,
        '-d',
        db,
        '-c',
        sql,
      ]);
      if (direct.exitCode !== 0) {
        throw new Error(direct.output || res.output || 'Erro ao executar query no container PostgreSQL.');
      }
      return [];
    }

    const text = (res.output || '').trim();
    if (!text || text === '[]') return [];
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  // ==========================================
  // EXECUTOR RESILIENTE MYSQL / MARIADB (TCP + DOCKER EXEC)
  // ==========================================
  public async queryMySQL(
    conn: DatabaseConnectionInfo,
    sql: string,
    targetDb?: string
  ): Promise<any[]> {
    const db = targetDb || conn.database || 'default';
    const cacheKey = `${conn.host}:${conn.port}`;

    const canTcp = await this.isTcpReachable(conn.host, conn.port, cacheKey);
    if (canTcp) {
      try {
        const connection = await mysql.createConnection({
          host: conn.host,
          port: conn.port,
          user: conn.user,
          password: conn.password,
          database: db,
          connectTimeout: 1200,
        });

        try {
          const [rows]: any = await connection.query(sql);
          return Array.isArray(rows) ? rows : [rows];
        } finally {
          await connection.end().catch(() => {});
        }
      } catch {
        this.tcpStatusCache.set(cacheKey, { reachable: false, lastChecked: Date.now() });
        return await this.queryMySQLViaDocker(conn, sql, db);
      }
    }

    return await this.queryMySQLViaDocker(conn, sql, db);
  }

  private async queryMySQLViaDocker(
    conn: DatabaseConnectionInfo,
    sql: string,
    db: string
  ): Promise<any[]> {
    const passArg = conn.password ? `-p${conn.password}` : '';
    const user = conn.user || 'root';

    const args = ['mysql', `-u${user}`];
    if (passArg) args.push(passArg);
    args.push('-D', db, '--batch', '--raw', '-e', sql);

    const res = await dockerService.execCommand(conn.containerName, args);
    if (res.exitCode !== 0) {
      throw new Error(res.output || 'Erro ao executar query no container MySQL/MariaDB.');
    }

    const text = (res.output || '').trim();
    if (!text) return [];

    // Parse de output TSV do mysql batch
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const headers = lines[0].split('\t');
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const rowObj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        rowObj[h] = cols[idx] !== undefined ? cols[idx] : '';
      });
      rows.push(rowObj);
    }
    return rows;
  }

  /**
   * Inspeciona e retorna o catálogo completo (Tabelas, Colunas, Tipos, PKs, FKs, Views e Funções)
   */
  public async getDatabaseCatalog(serviceId: string, requestedDb?: string): Promise<DatabaseCatalog> {
    const connInfo = await this.resolveConnectionInfo(serviceId);

    if (connInfo.type === 'postgres') {
      return await this.inspectPostgres(connInfo, requestedDb);
    }

    if (connInfo.type === 'mysql' || connInfo.type === 'mariadb') {
      return await this.inspectMySQL(connInfo, requestedDb);
    }

    throw new Error('Database Studio suporta bancos relacionais (PostgreSQL, MariaDB, MySQL).');
  }

  /**
   * Consulta completa de metadados do PostgreSQL em uma única operação SQL instantânea
   */
  private async fetchPostgresCatalog(conn: DatabaseConnectionInfo, db: string): Promise<any> {
    const allInOneSql = `
      SELECT json_build_object(
        'version', version(),
        'tables', (
          SELECT COALESCE(json_agg(table_name ORDER BY table_name), '[]'::json)
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ),
        'views', (
          SELECT COALESCE(json_agg(table_name ORDER BY table_name), '[]'::json)
          FROM information_schema.views
          WHERE table_schema = 'public'
        ),
        'routines', (
          SELECT COALESCE(json_agg(routine_name ORDER BY routine_name), '[]'::json)
          FROM information_schema.routines
          WHERE routine_schema = 'public'
        ),
        'row_estimates', (
          SELECT COALESCE(json_object_agg(relname, COALESCE(n_live_tup, 0)), '{}'::json)
          FROM pg_stat_user_tables
          WHERE schemaname = 'public'
        ),
        'columns', (
          SELECT COALESCE(json_agg(c), '[]'::json)
          FROM (
            SELECT table_name, column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
          ) c
        ),
        'pks', (
          SELECT COALESCE(json_agg(p), '[]'::json)
          FROM (
            SELECT kcu.table_name, kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
          ) p
        ),
        'fks', (
          SELECT COALESCE(json_agg(f), '[]'::json)
          FROM (
            SELECT
              tc.constraint_name,
              kcu.table_name,
              kcu.column_name,
              ccu.table_name AS foreign_table_name,
              ccu.column_name AS foreign_column_name,
              rc.update_rule AS on_update,
              rc.delete_rule AS on_delete
            FROM information_schema.table_constraints AS tc
            JOIN information_schema.key_column_usage AS kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage AS ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            LEFT JOIN information_schema.referential_constraints AS rc
              ON rc.constraint_name = tc.constraint_name
              AND rc.constraint_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
          ) f
        ),
        'indexes', (
          SELECT COALESCE(json_agg(idx), '[]'::json)
          FROM (
            SELECT
              i.relname AS name,
              t.relname AS table_name,
              ix.indisunique AS is_unique,
              ix.indisprimary AS is_primary,
              am.amname AS type,
              ARRAY(
                SELECT pg_get_indexdef(ix.indexrelid, k + 1, true)
                FROM generate_subscripts(ix.indkey, 1) as k
                ORDER BY k
              ) AS columns
            FROM pg_index ix
            JOIN pg_class t ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_namespace n ON n.oid = t.relnamespace
            JOIN pg_am am ON am.oid = i.relam
            WHERE n.nspname = 'public'
            ORDER BY t.relname, i.relname
          ) idx
        )
      );
    `;

    const rows = await this.queryPostgres(conn, allInOneSql, db);
    return rows[0]?.json_build_object || rows[0] || null;
  }

  /**
   * Inspeção ultra-rápida de PostgreSQL
   */
  private async inspectPostgres(conn: DatabaseConnectionInfo, requestedDb?: string): Promise<DatabaseCatalog> {
    // 1. Descobre bancos de dados disponíveis na instância de forma rápida
    let availableDatabases: string[] = [];
    try {
      const dbsRes = await this.queryPostgres(
        conn,
        `SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres') ORDER BY datname;`,
        'postgres'
      );
      availableDatabases = dbsRes.map((r: any) => r.datname);
    } catch {
      availableDatabases = [conn.database || 'postgres'];
    }

    // 2. Determina o banco ativo
    let activeDb = requestedDb || conn.database || 'postgres';
    let data = await this.fetchPostgresCatalog(conn, activeDb);

    // Se o banco configurado estiver vazio e o usuário não especificou banco, auto-seleciona banco com tabelas
    if ((!data?.tables || data.tables.length === 0) && !requestedDb && availableDatabases.length > 0) {
      for (const candidateDb of availableDatabases) {
        if (candidateDb !== activeDb) {
          try {
            const candData = await this.fetchPostgresCatalog(conn, candidateDb);
            if (candData?.tables && candData.tables.length > 0) {
              activeDb = candidateDb;
              data = candData;
              break;
            }
          } catch {
            // continua para o próximo
          }
        }
      }
    }

    const version = data?.version || 'PostgreSQL 16';
    const rawTables: string[] = data?.tables || [];
    const rawViews: string[] = data?.views || [];
    const rawRoutines: string[] = data?.routines || [];
    const columnsRows: any[] = data?.columns || [];
    const pkRows: any[] = data?.pks || [];
    const fkRows: any[] = data?.fks || [];
    const indexRows: any[] = data?.indexes || [];
    const rowEstimates: Record<string, number> = data?.row_estimates || {};

    // Mapeia PKs e FKs
    const pkMap: Record<string, string[]> = {};
    pkRows.forEach((r: any) => {
      if (!pkMap[r.table_name]) pkMap[r.table_name] = [];
      pkMap[r.table_name].push(r.column_name);
    });

    const fkMap: Record<string, DatabaseForeignKey[]> = {};
    const depMap: Record<string, DatabaseDependency[]> = {};
    fkRows.forEach((r: any) => {
      // FK de saída da tabela
      if (!fkMap[r.table_name]) fkMap[r.table_name] = [];
      fkMap[r.table_name].push({
        column: r.column_name,
        referencedTable: r.foreign_table_name,
        referencedColumn: r.foreign_column_name,
        constraintName: r.constraint_name,
        onDelete: r.on_delete,
        onUpdate: r.on_update,
      });

      // Dependência / Relação reversa (quem referencia foreign_table_name)
      if (!depMap[r.foreign_table_name]) depMap[r.foreign_table_name] = [];
      depMap[r.foreign_table_name].push({
        fromTable: r.table_name,
        fromColumn: r.column_name,
        toColumn: r.foreign_column_name,
        constraintName: r.constraint_name,
        onDelete: r.on_delete,
        onUpdate: r.on_update,
      });
    });

    // Mapeia Índices
    const indexMap: Record<string, DatabaseIndex[]> = {};
    indexRows.forEach((idx: any) => {
      if (!indexMap[idx.table_name]) indexMap[idx.table_name] = [];
      indexMap[idx.table_name].push({
        name: idx.name,
        tableName: idx.table_name,
        columns: Array.isArray(idx.columns) ? idx.columns : [idx.columns],
        isUnique: !!idx.is_unique,
        isPrimary: !!idx.is_primary,
        type: idx.type || 'btree',
      });
    });

    const tables: DatabaseTable[] = [];
    for (const tableName of rawTables) {
      const pks = pkMap[tableName] || [];
      const fks = fkMap[tableName] || [];
      const deps = depMap[tableName] || [];
      const indexes = indexMap[tableName] || [];
      const fkCols = new Set(fks.map((f) => f.column));

      const tableCols = columnsRows.filter((c: any) => c.table_name === tableName);
      const columns: DatabaseColumn[] = tableCols.map((c: any) => ({
        name: c.column_name,
        type: c.data_type,
        nullable: c.is_nullable === 'YES',
        defaultValue: c.column_default,
        isPrimaryKey: pks.includes(c.column_name),
        isForeignKey: fkCols.has(c.column_name),
      }));

      tables.push({
        name: tableName,
        schema: 'public',
        rowsEstimate: Number(rowEstimates[tableName] || 0),
        columns,
        primaryKeys: pks,
        foreignKeys: fks,
        dependencies: deps,
        indexes,
      });
    }

    return {
      databaseType: 'postgres',
      databaseName: activeDb,
      version,
      tables,
      views: rawViews,
      functions: rawRoutines,
      availableDatabases: availableDatabases.length > 0 ? availableDatabases : [activeDb],
    };
  }

  /**
   * Inspeção detalhada de MySQL / MariaDB
   */
  private async inspectMySQL(conn: DatabaseConnectionInfo, requestedDb?: string): Promise<DatabaseCatalog> {
    const activeDb = requestedDb || conn.database || 'default';

    const vRows = await this.queryMySQL(conn, 'SELECT VERSION() as ver;', activeDb);
    const version = vRows[0]?.ver || 'MySQL/MariaDB';

    const tablesRows = await this.queryMySQL(
      conn,
      `SELECT TABLE_NAME, TABLE_ROWS
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = '${activeDb}' AND TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_NAME;`,
      activeDb
    );

    const viewsRows = await this.queryMySQL(
      conn,
      `SELECT TABLE_NAME
       FROM information_schema.VIEWS
       WHERE TABLE_SCHEMA = '${activeDb}'
       ORDER BY TABLE_NAME;`,
      activeDb
    );

    let routinesRows: any[] = [];
    try {
      routinesRows = await this.queryMySQL(
        conn,
        `SELECT ROUTINE_NAME
         FROM information_schema.ROUTINES
         WHERE ROUTINE_SCHEMA = '${activeDb}'
         ORDER BY ROUTINE_NAME;`,
        activeDb
      );
    } catch {
      // Ignora se não houver permissão em ROUTINES
    }

    const columnsRows = await this.queryMySQL(
      conn,
      `SELECT 
        TABLE_NAME,
        COLUMN_NAME,
        COLUMN_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COLUMN_KEY
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = '${activeDb}'
       ORDER BY TABLE_NAME, ORDINAL_POSITION;`,
      activeDb
    );

    const fkRows = await this.queryMySQL(
      conn,
      `SELECT 
        CONSTRAINT_NAME,
        TABLE_NAME,
        COLUMN_NAME,
        REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = '${activeDb}' AND REFERENCED_TABLE_NAME IS NOT NULL;`,
      activeDb
    );

    const fkMap: Record<string, DatabaseForeignKey[]> = {};
    fkRows.forEach((r: any) => {
      if (!fkMap[r.TABLE_NAME]) fkMap[r.TABLE_NAME] = [];
      fkMap[r.TABLE_NAME].push({
        column: r.COLUMN_NAME,
        referencedTable: r.REFERENCED_TABLE_NAME,
        referencedColumn: r.REFERENCED_COLUMN_NAME,
        constraintName: r.CONSTRAINT_NAME,
      });
    });

    const tables: DatabaseTable[] = [];
    for (const tRow of tablesRows) {
      const tableName = tRow.TABLE_NAME;
      const fks = fkMap[tableName] || [];
      const fkCols = new Set(fks.map((f) => f.column));

      const tableCols = columnsRows.filter((c: any) => c.TABLE_NAME === tableName);
      const pks: string[] = [];

      const columns: DatabaseColumn[] = tableCols.map((c: any) => {
        const isPk = c.COLUMN_KEY === 'PRI';
        if (isPk) pks.push(c.COLUMN_NAME);
        return {
          name: c.COLUMN_NAME,
          type: c.COLUMN_TYPE,
          nullable: c.IS_NULLABLE === 'YES',
          defaultValue: c.COLUMN_DEFAULT,
          isPrimaryKey: isPk,
          isForeignKey: fkCols.has(c.COLUMN_NAME),
        };
      });

      tables.push({
        name: tableName,
        schema: activeDb,
        rowsEstimate: Number(tRow.TABLE_ROWS || 0),
        columns,
        primaryKeys: pks,
        foreignKeys: fks,
      });
    }

    return {
      databaseType: conn.type as 'mysql' | 'mariadb',
      databaseName: activeDb,
      version,
      tables,
      views: viewsRows.map((r: any) => r.TABLE_NAME),
      functions: routinesRows.map((r: any) => r.ROUTINE_NAME),
      availableDatabases: [activeDb],
    };
  }

  /**
   * Retorna os dados tabulares paginados de uma tabela de forma ultra-otimizada
   */
  public async getTableData(
    serviceId: string,
    tableName: string,
    page: number = 1,
    limit: number = 50,
    databaseName?: string
  ): Promise<{ rows: any[]; totalCount: number; page: number; limit: number }> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const offset = Math.max(0, (page - 1) * limit);

    if (!/^[a-zA-Z0-9_.-]+$/.test(tableName)) {
      throw new Error('Nome de tabela inválido.');
    }

    if (conn.type === 'postgres') {
      // Otimização de Performance: Uma única query SQL estruturada (elimina roundtrips extras)
      const combinedSql = `
        SELECT json_build_object(
          'total', (SELECT count(*) FROM "${tableName}"),
          'rows', COALESCE((SELECT json_agg(t) FROM (SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}) t), '[]'::json)
        ) as payload;
      `;
      try {
        const res = await this.queryPostgres(conn, combinedSql, databaseName);
        const rawPayload = res[0]?.payload || res[0]?.json_build_object;
        if (rawPayload) {
          const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
          const rows = payload.rows || [];
          const totalCount = parseInt(payload.total ?? rows.length, 10);
          return { rows, totalCount, page, limit };
        }
      } catch {
        // Fallback paralelo em caso de erro na estruturação JSON
      }

      const [countRes, rows] = await Promise.all([
        this.queryPostgres(conn, `SELECT count(*) as total FROM "${tableName}";`, databaseName),
        this.queryPostgres(conn, `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset};`, databaseName),
      ]);
      const totalCount = parseInt(countRes[0]?.total || '0', 10);
      return { rows, totalCount, page, limit };
    }

    if (conn.type === 'mysql' || conn.type === 'mariadb') {
      const [countRows, rows] = await Promise.all([
        this.queryMySQL(conn, `SELECT count(*) as total FROM \`${tableName}\`;`, databaseName),
        this.queryMySQL(conn, `SELECT * FROM \`${tableName}\` LIMIT ${limit} OFFSET ${offset};`, databaseName),
      ]);
      const totalCount = parseInt(countRows[0]?.total || '0', 10);
      return { rows, totalCount, page, limit };
    }

    throw new Error('Tipo de banco não suportado para consulta de dados.');
  }

  /**
   * Aplica alterações inline em linhas da tabela (Auto-commit ou Transação com COMMIT/ROLLBACK)
   */
  public async updateTableData(
    serviceId: string,
    tableName: string,
    updates: Array<{ primaryKey: Record<string, any>; changes: Record<string, any> }>,
    mode: 'auto' | 'transaction' | 'commit' = 'auto',
    databaseName?: string
  ): Promise<{ success: boolean; affectedRows: number; durationMs: number }> {
    const start = Date.now();
    const conn = await this.resolveConnectionInfo(serviceId);

    if (!/^[a-zA-Z0-9_.-]+$/.test(tableName)) {
      throw new Error('Nome de tabela inválido.');
    }

    if (!Array.isArray(updates) || updates.length === 0) {
      throw new Error('Nenhuma alteração informada.');
    }

    // Helper de escape seguro de valores SQL
    const formatSqlValue = (val: any): string => {
      if (val === null || val === undefined) return 'NULL';
      if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
      if (typeof val === 'number') return isFinite(val) ? String(val) : 'NULL';
      if (typeof val === 'object') {
        const jsonStr = JSON.stringify(val).replace(/'/g, "''");
        return `'${jsonStr}'`;
      }
      return `'${String(val).replace(/'/g, "''")}'`;
    };

    const statements: string[] = [];

    for (const item of updates) {
      const { primaryKey, changes } = item;
      if (!primaryKey || Object.keys(primaryKey).length === 0) {
        throw new Error('Chave primária obrigatória para localizar o registro a alterar.');
      }
      if (!changes || Object.keys(changes).length === 0) {
        continue;
      }

      // Validação de nomes de colunas
      for (const col of [...Object.keys(changes), ...Object.keys(primaryKey)]) {
        if (!/^[a-zA-Z0-9_.-]+$/.test(col)) {
          throw new Error(`Nome de coluna inválido: ${col}`);
        }
      }

      if (conn.type === 'postgres') {
        const setClauses = Object.entries(changes)
          .map(([col, val]) => `"${col}" = ${formatSqlValue(val)}`)
          .join(', ');
        const whereClauses = Object.entries(primaryKey)
          .map(([col, val]) => `"${col}" = ${formatSqlValue(val)}`)
          .join(' AND ');
        statements.push(`UPDATE "${tableName}" SET ${setClauses} WHERE ${whereClauses};`);
      } else if (conn.type === 'mysql' || conn.type === 'mariadb') {
        const setClauses = Object.entries(changes)
          .map(([col, val]) => `\`${col}\` = ${formatSqlValue(val)}`)
          .join(', ');
        const whereClauses = Object.entries(primaryKey)
          .map(([col, val]) => `\`${col}\` = ${formatSqlValue(val)}`)
          .join(' AND ');
        statements.push(`UPDATE \`${tableName}\` SET ${setClauses} WHERE ${whereClauses};`);
      }
    }

    if (statements.length === 0) {
      return { success: true, affectedRows: 0, durationMs: Date.now() - start };
    }

    const isTransaction = mode === 'transaction' || mode === 'commit';

    if (conn.type === 'postgres') {
      const fullSql = isTransaction
        ? `BEGIN;\n${statements.join('\n')}\nCOMMIT;`
        : statements.join('\n');
      await this.queryPostgres(conn, fullSql, databaseName);
    } else if (conn.type === 'mysql' || conn.type === 'mariadb') {
      const fullSql = isTransaction
        ? `START TRANSACTION;\n${statements.join('\n')}\nCOMMIT;`
        : statements.join('\n');
      await this.queryMySQL(conn, fullSql, databaseName);
    } else {
      throw new Error('Banco de dados não suporta operações de atualização direta.');
    }

    return {
      success: true,
      affectedRows: statements.length,
      durationMs: Date.now() - start,
    };
  }

  /**
   * Executa uma consulta SQL informada pelo usuário no Console SQL
   */
  public async executeSqlQuery(
    serviceId: string,
    querySql: string,
    databaseName?: string
  ): Promise<{ rows: any[]; rowCount: number; durationMs: number }> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const start = Date.now();

    if (conn.type === 'postgres') {
      const rows = await this.queryPostgres(conn, querySql, databaseName);
      const durationMs = Date.now() - start;
      return {
        rows,
        rowCount: rows.length,
        durationMs,
      };
    }

    if (conn.type === 'mysql' || conn.type === 'mariadb') {
      const rows = await this.queryMySQL(conn, querySql, databaseName);
      const durationMs = Date.now() - start;
      return {
        rows,
        rowCount: rows.length,
        durationMs,
      };
    }

    throw new Error('Tipo de banco de dados não suportado para queries SQL.');
  }

  // ==========================================
  // MÉTODOS DO REDIS STUDIO (TCP + DOCKER EXEC)
  // ==========================================

  private getRedisClient(conn: DatabaseConnectionInfo): Redis {
    return new Redis({
      host: conn.host,
      port: conn.port,
      password: conn.password,
      connectTimeout: 2500,
      lazyConnect: true,
      retryStrategy: () => null,
    });
  }

  /**
   * Retorna métricas do servidor Redis com fallback para docker exec
   */
  public async getRedisMetrics(serviceId: string): Promise<RedisServerMetrics> {
    const conn = await this.resolveConnectionInfo(serviceId);

    // 1. Tenta TCP
    try {
      const redis = this.getRedisClient(conn);
      await redis.connect();
      try {
        const rawInfo = await redis.info();
        const dbSize = await redis.dbsize();

        const parseField = (pattern: RegExp) => {
          const match = rawInfo.match(pattern);
          return match ? match[1].trim() : '';
        };

        return {
          usedMemoryHuman: parseField(/used_memory_human:(.+)/) || 'N/A',
          usedMemoryPeakHuman: parseField(/used_memory_peak_human:(.+)/) || 'N/A',
          connectedClients: parseInt(parseField(/connected_clients:(\d+)/) || '0', 10),
          totalKeys: dbSize,
          uptimeInSeconds: parseInt(parseField(/uptime_in_seconds:(\d+)/) || '0', 10),
          redisVersion: parseField(/redis_version:(.+)/) || '7.x',
          opsPerSec: parseInt(parseField(/instantaneous_ops_per_sec:(\d+)/) || '0', 10),
        };
      } finally {
        redis.disconnect();
      }
    } catch {
      // 2. Fallback Docker Exec
      const infoRes = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'info',
      ]);
      const dbsizeRes = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'dbsize',
      ]);

      const rawInfo = infoRes.output || '';
      const totalKeys = parseInt((dbsizeRes.output || '').replace(/[^\d]/g, '') || '0', 10);

      const parseField = (pattern: RegExp) => {
        const match = rawInfo.match(pattern);
        return match ? match[1].trim() : '';
      };

      return {
        usedMemoryHuman: parseField(/used_memory_human:(.+)/) || '1.5M',
        usedMemoryPeakHuman: parseField(/used_memory_peak_human:(.+)/) || '3.5M',
        connectedClients: parseInt(parseField(/connected_clients:(\d+)/) || '1', 10),
        totalKeys,
        uptimeInSeconds: parseInt(parseField(/uptime_in_seconds:(\d+)/) || '0', 10),
        redisVersion: parseField(/redis_version:(.+)/) || '7.x',
        opsPerSec: parseInt(parseField(/instantaneous_ops_per_sec:(\d+)/) || '0', 10),
      };
    }
  }

  /**
   * Lista chaves do Redis com paginação e filtro pattern
   */
  public async getRedisKeys(serviceId: string, pattern: string = '*'): Promise<RedisKeyInfo[]> {
    const conn = await this.resolveConnectionInfo(serviceId);

    // 1. Tenta TCP
    try {
      const redis = this.getRedisClient(conn);
      await redis.connect();
      try {
        const keys = await redis.keys(pattern || '*');
        const limitedKeys = keys.slice(0, 200);

        const result: RedisKeyInfo[] = [];
        for (const key of limitedKeys) {
          const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)]);
          result.push({
            key,
            type: type as any,
            ttl,
          });
        }
        return result;
      } finally {
        redis.disconnect();
      }
    } catch {
      // 2. Fallback Docker Exec
      const res = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'keys',
        pattern || '*',
      ]);

      const lines = (res.output || '')
        .split('\n')
        .map((l) => l.trim().replace(/^\d+\)\s*"/, '').replace(/"$/, ''))
        .filter(Boolean);

      const limitedKeys = lines.slice(0, 200);
      const result: RedisKeyInfo[] = [];

      for (const key of limitedKeys) {
        let type: any = 'string';
        let ttl = -1;
        try {
          const typeRes = await dockerService.execCommand(conn.containerName, [
            'redis-cli',
            ...(conn.password ? ['-a', conn.password] : []),
            'type',
            key,
          ]);
          type = (typeRes.output || 'string').trim();

          const ttlRes = await dockerService.execCommand(conn.containerName, [
            'redis-cli',
            ...(conn.password ? ['-a', conn.password] : []),
            'ttl',
            key,
          ]);
          ttl = parseInt((ttlRes.output || '-1').trim(), 10);
        } catch {
          // ignore individual key errors
        }

        result.push({
          key,
          type,
          ttl: isNaN(ttl) ? -1 : ttl,
        });
      }

      return result;
    }
  }

  /**
   * Retorna os detalhes e valores de uma chave específica do Redis
   */
  public async getRedisKeyDetail(serviceId: string, key: string): Promise<RedisKeyInfo> {
    const conn = await this.resolveConnectionInfo(serviceId);

    try {
      const redis = this.getRedisClient(conn);
      await redis.connect();
      try {
        const type = (await redis.type(key)) as RedisKeyInfo['type'];
        const ttl = await redis.ttl(key);

        let value: any = null;
        let length: number | undefined = undefined;

        if (type === 'string') {
          value = await redis.get(key);
        } else if (type === 'hash') {
          value = await redis.hgetall(key);
          length = Object.keys(value || {}).length;
        } else if (type === 'list') {
          value = await redis.lrange(key, 0, 99);
          length = await redis.llen(key);
        } else if (type === 'set') {
          value = await redis.smembers(key);
          length = await redis.scard(key);
        } else if (type === 'zset') {
          value = await redis.zrange(key, 0, 99, 'WITHSCORES');
          length = await redis.zcard(key);
        }

        return { key, type, ttl, length, value };
      } finally {
        redis.disconnect();
      }
    } catch {
      // Fallback Docker Exec
      const typeRes = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'type',
        key,
      ]);
      const type = (typeRes.output || 'string').trim() as RedisKeyInfo['type'];

      const ttlRes = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'ttl',
        key,
      ]);
      const ttl = parseInt((ttlRes.output || '-1').trim(), 10);

      const valRes = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'get',
        key,
      ]);
      const value = (valRes.output || '').trim();

      return { key, type, ttl, value };
    }
  }

  /**
   * Cria ou atualiza uma chave no Redis
   */
  public async setRedisKey(
    serviceId: string,
    key: string,
    value: string,
    type: 'string' | 'hash' = 'string',
    ttl?: number,
    hashField?: string
  ): Promise<void> {
    const conn = await this.resolveConnectionInfo(serviceId);

    try {
      const redis = this.getRedisClient(conn);
      await redis.connect();
      try {
        if (type === 'string') {
          if (ttl && ttl > 0) {
            await redis.set(key, value, 'EX', ttl);
          } else {
            await redis.set(key, value);
          }
        } else if (type === 'hash' && hashField) {
          await redis.hset(key, hashField, value);
          if (ttl && ttl > 0) {
            await redis.expire(key, ttl);
          }
        }
        return;
      } finally {
        redis.disconnect();
      }
    } catch {
      // Fallback Docker Exec
      if (type === 'string') {
        const args = [
          'redis-cli',
          ...(conn.password ? ['-a', conn.password] : []),
          'set',
          key,
          value,
        ];
        if (ttl && ttl > 0) {
          args.push('EX', String(ttl));
        }
        await dockerService.execCommand(conn.containerName, args);
      }
    }
  }

  /**
   * Deleta uma chave do Redis
   */
  public async deleteRedisKey(serviceId: string, key: string): Promise<void> {
    const conn = await this.resolveConnectionInfo(serviceId);

    try {
      const redis = this.getRedisClient(conn);
      await redis.connect();
      try {
        await redis.del(key);
        return;
      } finally {
        redis.disconnect();
      }
    } catch {
      // Fallback Docker Exec
      await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        'del',
        key,
      ]);
    }
  }

  /**
   * Executa um comando arbitrário no terminal CLI do Redis
   */
  public async executeRedisCommand(serviceId: string, commandStr: string): Promise<any> {
    const conn = await this.resolveConnectionInfo(serviceId);

    try {
      const redis = this.getRedisClient(conn);
      await redis.connect();
      try {
        const parts = commandStr.trim().split(/\s+/);
        const cmd = parts[0]?.toLowerCase();
        const args = parts.slice(1);

        if (!cmd) throw new Error('Comando vazio.');
        return await redis.call(cmd, ...args);
      } finally {
        redis.disconnect();
      }
    } catch {
      // Fallback Docker Exec
      const parts = commandStr.trim().split(/\s+/);
      const res = await dockerService.execCommand(conn.containerName, [
        'redis-cli',
        ...(conn.password ? ['-a', conn.password] : []),
        ...parts,
      ]);
      return res.output || '';
    }
  }
}

export const databaseInspectorService = new DatabaseInspectorService();
