import pg from 'pg';
import mysql from 'mysql2/promise';
import { Redis } from 'ioredis';
import { prisma } from '../db.js';
import type {
  DatabaseCatalog,
  DatabaseTable,
  DatabaseColumn,
  DatabaseForeignKey,
  RedisKeyInfo,
  RedisServerMetrics,
} from '@stackorbit/shared';

export interface DatabaseConnectionInfo {
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

    // No Linux em produção na rede Docker proxy-net, o host é o próprio containerName
    // Em dev local, usa 127.0.0.1 ou containerName
    const host = process.env.NODE_ENV === 'production' || process.platform === 'linux'
      ? service.containerName
      : '127.0.0.1';

    if (img.includes('postgres')) {
      return {
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
        type: 'redis',
        host,
        port: service.internalPort || 6379,
        password: envVars.REDIS_PASSWORD || undefined,
      };
    }

    throw new Error(`Tipo de banco de dados não suportado para a imagem: ${service.image}`);
  }

  /**
   * Inspeciona e retorna o catálogo completo (Tabelas, Colunas, Tipos, PKs, FKs, Views e Funções)
   */
  public async getDatabaseCatalog(serviceId: string): Promise<DatabaseCatalog> {
    const connInfo = await this.resolveConnectionInfo(serviceId);

    if (connInfo.type === 'postgres') {
      return await this.inspectPostgres(connInfo);
    }

    if (connInfo.type === 'mysql' || connInfo.type === 'mariadb') {
      return await this.inspectMySQL(connInfo);
    }

    throw new Error('Database Studio suporta bancos relacionais (PostgreSQL, MariaDB, MySQL).');
  }

  /**
   * Inspeção detalhada de PostgreSQL
   */
  private async inspectPostgres(conn: DatabaseConnectionInfo): Promise<DatabaseCatalog> {
    const client = new pg.Client({
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database: conn.database,
      connectionTimeoutMillis: 5000,
    });

    try {
      await client.connect();

      // Versão do PostgreSQL
      const versionRes = await client.query('SELECT version();');
      const version = versionRes.rows[0]?.version || 'PostgreSQL';

      // Tabelas no schema public
      const tablesRes = await client.query(`
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name;
      `);

      // Views
      const viewsRes = await client.query(`
        SELECT table_name
        FROM information_schema.views
        WHERE table_schema = 'public'
        ORDER BY table_name;
      `);

      // Funções / Procedures
      const funcsRes = await client.query(`
        SELECT routine_name
        FROM information_schema.routines
        WHERE routine_schema = 'public'
        ORDER BY routine_name;
      `);

      // Colunas
      const columnsRes = await client.query(`
        SELECT 
          table_name,
          column_name,
          data_type,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public'
        ORDER BY table_name, ordinal_position;
      `);

      // Chaves Primárias
      const pkRes = await client.query(`
        SELECT
          kcu.table_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public';
      `);

      // Chaves Estrangeiras (Foreign Keys)
      const fkRes = await client.query(`
        SELECT
          tc.constraint_name,
          kcu.table_name,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
      `);

      // Mapeia PKs e FKs
      const pkMap: Record<string, string[]> = {};
      pkRes.rows.forEach((r) => {
        if (!pkMap[r.table_name]) pkMap[r.table_name] = [];
        pkMap[r.table_name].push(r.column_name);
      });

      const fkMap: Record<string, DatabaseForeignKey[]> = {};
      fkRes.rows.forEach((r) => {
        if (!fkMap[r.table_name]) fkMap[r.table_name] = [];
        fkMap[r.table_name].push({
          column: r.column_name,
          referencedTable: r.foreign_table_name,
          referencedColumn: r.foreign_column_name,
          constraintName: r.constraint_name,
        });
      });

      const tables: DatabaseTable[] = [];
      for (const tRow of tablesRes.rows) {
        const tableName = tRow.table_name;
        const pks = pkMap[tableName] || [];
        const fks = fkMap[tableName] || [];
        const fkCols = new Set(fks.map((f) => f.column));

        const tableCols = columnsRes.rows.filter((c) => c.table_name === tableName);
        const columns: DatabaseColumn[] = tableCols.map((c) => ({
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
          rowsEstimate: 0,
          columns,
          primaryKeys: pks,
          foreignKeys: fks,
        });
      }

      return {
        databaseType: 'postgres',
        databaseName: conn.database || 'postgres',
        version,
        tables,
        views: viewsRes.rows.map((r) => r.table_name),
        functions: funcsRes.rows.map((r) => r.routine_name),
      };
    } finally {
      await client.end().catch(() => {});
    }
  }

  /**
   * Inspeção detalhada de MySQL / MariaDB
   */
  private async inspectMySQL(conn: DatabaseConnectionInfo): Promise<DatabaseCatalog> {
    const connection = await mysql.createConnection({
      host: conn.host,
      port: conn.port,
      user: conn.user,
      password: conn.password,
      database: conn.database,
      connectTimeout: 5000,
    });

    try {
      const [vRows]: any = await connection.query('SELECT VERSION() as ver;');
      const version = vRows[0]?.ver || 'MySQL/MariaDB';

      const [tablesRows]: any = await connection.query(
        `SELECT TABLE_NAME, TABLE_ROWS
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME;`,
        [conn.database]
      );

      const [viewsRows]: any = await connection.query(
        `SELECT TABLE_NAME
         FROM information_schema.VIEWS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME;`,
        [conn.database]
      );

      const [columnsRows]: any = await connection.query(
        `SELECT 
          TABLE_NAME,
          COLUMN_NAME,
          COLUMN_TYPE,
          IS_NULLABLE,
          COLUMN_DEFAULT,
          COLUMN_KEY
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION;`,
        [conn.database]
      );

      const [fkRows]: any = await connection.query(
        `SELECT 
          CONSTRAINT_NAME,
          TABLE_NAME,
          COLUMN_NAME,
          REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME
         FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL;`,
        [conn.database]
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
          schema: conn.database || 'default',
          rowsEstimate: Number(tRow.TABLE_ROWS || 0),
          columns,
          primaryKeys: pks,
          foreignKeys: fks,
        });
      }

      return {
        databaseType: conn.type as 'mysql' | 'mariadb',
        databaseName: conn.database || 'default',
        version,
        tables,
        views: viewsRows.map((r: any) => r.TABLE_NAME),
        functions: [],
      };
    } finally {
      await connection.end().catch(() => {});
    }
  }

  /**
   * Retorna os dados tabulares paginados de uma tabela
   */
  public async getTableData(
    serviceId: string,
    tableName: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ rows: any[]; totalCount: number; page: number; limit: number }> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const offset = Math.max(0, (page - 1) * limit);

    // Validação de segurança básica de nome de tabela
    if (!/^[a-zA-Z0-9_.-]+$/.test(tableName)) {
      throw new Error('Nome de tabela inválido.');
    }

    if (conn.type === 'postgres') {
      const client = new pg.Client({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        database: conn.database,
      });
      try {
        await client.connect();
        const countRes = await client.query(`SELECT count(*) as total FROM "${tableName}";`);
        const totalCount = parseInt(countRes.rows[0]?.total || '0', 10);

        const dataRes = await client.query(`SELECT * FROM "${tableName}" LIMIT $1 OFFSET $2;`, [limit, offset]);
        return { rows: dataRes.rows, totalCount, page, limit };
      } finally {
        await client.end().catch(() => {});
      }
    }

    if (conn.type === 'mysql' || conn.type === 'mariadb') {
      const connection = await mysql.createConnection({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        database: conn.database,
      });
      try {
        const [countRows]: any = await connection.query(`SELECT count(*) as total FROM \`${tableName}\`;`);
        const totalCount = countRows[0]?.total || 0;

        const [dataRows]: any = await connection.query(`SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?;`, [limit, offset]);
        return { rows: dataRows, totalCount, page, limit };
      } finally {
        await connection.end().catch(() => {});
      }
    }

    throw new Error('Tipo de banco não suportado para consulta de dados.');
  }

  /**
   * Executa uma consulta SQL informada pelo usuário no Console SQL
   */
  public async executeSqlQuery(serviceId: string, querySql: string): Promise<{ rows: any[]; rowCount: number; durationMs: number }> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const start = Date.now();

    if (conn.type === 'postgres') {
      const client = new pg.Client({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        database: conn.database,
      });
      try {
        await client.connect();
        const res = await client.query(querySql);
        const durationMs = Date.now() - start;
        return {
          rows: Array.isArray(res) ? res[res.length - 1]?.rows || [] : res.rows || [],
          rowCount: Array.isArray(res) ? res[res.length - 1]?.rowCount || 0 : res.rowCount || 0,
          durationMs,
        };
      } finally {
        await client.end().catch(() => {});
      }
    }

    if (conn.type === 'mysql' || conn.type === 'mariadb') {
      const connection = await mysql.createConnection({
        host: conn.host,
        port: conn.port,
        user: conn.user,
        password: conn.password,
        database: conn.database,
        multipleStatements: true,
      });
      try {
        const [rows, fields]: any = await connection.query(querySql);
        const durationMs = Date.now() - start;
        const resultRows = Array.isArray(rows) ? rows : [rows];
        return {
          rows: resultRows,
          rowCount: resultRows.length,
          durationMs,
        };
      } finally {
        await connection.end().catch(() => {});
      }
    }

    throw new Error('Tipo de banco de dados não suportado para queries SQL.');
  }

  // ==========================================
  // MÉTODOS DO REDIS STUDIO
  // ==========================================

  /**
   * Conecta ao Redis da instância
   */
  private getRedisClient(conn: DatabaseConnectionInfo): Redis {
    return new Redis({
      host: conn.host,
      port: conn.port,
      password: conn.password,
      connectTimeout: 4000,
      lazyConnect: true,
      retryStrategy: () => null,
    });
  }

  /**
   * Retorna métricas do servidor Redis
   */
  public async getRedisMetrics(serviceId: string): Promise<RedisServerMetrics> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const redis = this.getRedisClient(conn);

    try {
      await redis.connect();
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
  }

  /**
   * Lista chaves do Redis com paginação e filtro pattern
   */
  public async getRedisKeys(serviceId: string, pattern: string = '*'): Promise<RedisKeyInfo[]> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const redis = this.getRedisClient(conn);

    try {
      await redis.connect();
      // Limita a busca para performance
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
  }

  /**
   * Retorna os detalhes e valores de uma chave específica do Redis
   */
  public async getRedisKeyDetail(serviceId: string, key: string): Promise<RedisKeyInfo> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const redis = this.getRedisClient(conn);

    try {
      await redis.connect();
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
    const redis = this.getRedisClient(conn);

    try {
      await redis.connect();

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
    } finally {
      redis.disconnect();
    }
  }

  /**
   * Deleta uma chave do Redis
   */
  public async deleteRedisKey(serviceId: string, key: string): Promise<void> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const redis = this.getRedisClient(conn);

    try {
      await redis.connect();
      await redis.del(key);
    } finally {
      redis.disconnect();
    }
  }

  /**
   * Executa um comando arbitrário no terminal CLI do Redis
   */
  public async executeRedisCommand(serviceId: string, commandStr: string): Promise<any> {
    const conn = await this.resolveConnectionInfo(serviceId);
    const redis = this.getRedisClient(conn);

    try {
      await redis.connect();
      const parts = commandStr.trim().split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const args = parts.slice(1);

      if (!cmd) throw new Error('Comando vazio.');
      const res = await redis.call(cmd, ...args);
      return res;
    } finally {
      redis.disconnect();
    }
  }
}

export const databaseInspectorService = new DatabaseInspectorService();
