import type { ServiceTemplate } from '../types/index.ts';

export const SERVICE_TEMPLATES: ServiceTemplate[] = [
  // ---------------------------------------------------------------------------
  // 1. BANCOS DE DADOS RELACIONAIS & DOCUMENTAIS
  // ---------------------------------------------------------------------------
  {
    id: 'postgres',
    name: 'PostgreSQL 16',
    category: 'database',
    categoryLabel: 'Banco de Dados',
    description: 'Banco de dados relacional SQL robusto, transacional e de alto desempenho.',
    iconName: 'Database',
    defaultImage: 'postgres:16-alpine',
    defaultPort: 5432,
    defaultContainerName: 'postgres-srv',
    isWebUI: false,
    fields: [
      {
        key: 'POSTGRES_USER',
        label: 'Usuário do Banco',
        type: 'text',
        defaultValue: 'postgres',
        placeholder: 'postgres',
        required: true,
      },
      {
        key: 'POSTGRES_PASSWORD',
        label: 'Senha do Banco',
        type: 'password',
        defaultValue: 'Postgres2026!Sec',
        placeholder: '••••••••',
        required: true,
      },
      {
        key: 'POSTGRES_DB',
        label: 'Nome do Banco Inicial',
        type: 'text',
        defaultValue: 'app_production',
        placeholder: 'app_production',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `POSTGRES_USER=${values.POSTGRES_USER || 'postgres'}\n` +
      `POSTGRES_PASSWORD=${values.POSTGRES_PASSWORD || 'Postgres2026!Sec'}\n` +
      `POSTGRES_DB=${values.POSTGRES_DB || 'app_production'}\n` +
      `PGDATA=/var/lib/postgresql/data/pgdata`,
    generateConnectionString: (values, containerName) =>
      `postgresql://${values.POSTGRES_USER || 'postgres'}:${encodeURIComponent(values.POSTGRES_PASSWORD || '')}@${containerName}:5432/${values.POSTGRES_DB || 'app_production'}`,
  },
  {
    id: 'mariadb',
    name: 'MariaDB 11 (MySQL)',
    category: 'database',
    categoryLabel: 'Banco de Dados',
    description: 'Substituto rápido e aberto do MySQL, compatível com WordPress e apps PHP/Node.',
    iconName: 'Database',
    defaultImage: 'mariadb:11',
    defaultPort: 3306,
    defaultContainerName: 'mariadb-srv',
    isWebUI: false,
    fields: [
      {
        key: 'MARIADB_USER',
        label: 'Usuário da Aplicação',
        type: 'text',
        defaultValue: 'app_user',
        placeholder: 'app_user',
        required: true,
      },
      {
        key: 'MARIADB_PASSWORD',
        label: 'Senha da Aplicação',
        type: 'password',
        defaultValue: 'MariaDB@2026Pass',
        placeholder: '••••••••',
        required: true,
      },
      {
        key: 'MARIADB_ROOT_PASSWORD',
        label: 'Senha do Root',
        type: 'password',
        defaultValue: 'RootRoot@2026!',
        placeholder: '••••••••',
        required: true,
      },
      {
        key: 'MARIADB_DATABASE',
        label: 'Nome do Banco',
        type: 'text',
        defaultValue: 'app_database',
        placeholder: 'app_database',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `MARIADB_USER=${values.MARIADB_USER || 'app_user'}\n` +
      `MARIADB_PASSWORD=${values.MARIADB_PASSWORD || 'MariaDB@2026Pass'}\n` +
      `MARIADB_ROOT_PASSWORD=${values.MARIADB_ROOT_PASSWORD || 'RootRoot@2026!'}\n` +
      `MARIADB_DATABASE=${values.MARIADB_DATABASE || 'app_database'}`,
    generateConnectionString: (values, containerName) =>
      `mysql://${values.MARIADB_USER || 'app_user'}:${encodeURIComponent(values.MARIADB_PASSWORD || '')}@${containerName}:3306/${values.MARIADB_DATABASE || 'app_database'}`,
  },
  {
    id: 'mongodb',
    name: 'MongoDB 7 Community',
    category: 'database',
    categoryLabel: 'Banco de Dados',
    description: 'Banco de dados NoSQL NoSQL orientado a documentos JSON/BSON escalável.',
    iconName: 'Layers',
    defaultImage: 'mongo:7',
    defaultPort: 27017,
    defaultContainerName: 'mongodb-srv',
    isWebUI: false,
    fields: [
      {
        key: 'MONGO_INITDB_ROOT_USERNAME',
        label: 'Usuário Root/Admin',
        type: 'text',
        defaultValue: 'admin',
        placeholder: 'admin',
        required: true,
      },
      {
        key: 'MONGO_INITDB_ROOT_PASSWORD',
        label: 'Senha Root/Admin',
        type: 'password',
        defaultValue: 'MongoSecret@2026!',
        placeholder: '••••••••',
        required: true,
      },
      {
        key: 'MONGO_INITDB_DATABASE',
        label: 'Banco de Dados',
        type: 'text',
        defaultValue: 'app_data',
        placeholder: 'app_data',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `MONGO_INITDB_ROOT_USERNAME=${values.MONGO_INITDB_ROOT_USERNAME || 'admin'}\n` +
      `MONGO_INITDB_ROOT_PASSWORD=${values.MONGO_INITDB_ROOT_PASSWORD || 'MongoSecret@2026!'}\n` +
      `MONGO_INITDB_DATABASE=${values.MONGO_INITDB_DATABASE || 'app_data'}`,
    generateConnectionString: (values, containerName) =>
      `mongodb://${values.MONGO_INITDB_ROOT_USERNAME || 'admin'}:${encodeURIComponent(values.MONGO_INITDB_ROOT_PASSWORD || '')}@${containerName}:27017/${values.MONGO_INITDB_DATABASE || 'app_data'}?authSource=admin`,
  },

  // ---------------------------------------------------------------------------
  // 2. CACHE, MENSAGERIA E FILAS
  // ---------------------------------------------------------------------------
  {
    id: 'redis',
    name: 'Redis 7 (Cache & Key-Value)',
    category: 'cache_queue',
    categoryLabel: 'Cache & Filas',
    description: 'Armazenamento em memória de altíssima velocidade para sessões, cache e pub/sub.',
    iconName: 'Zap',
    defaultImage: 'redis:7-alpine',
    defaultPort: 6379,
    defaultContainerName: 'redis-srv',
    isWebUI: false,
    fields: [
      {
        key: 'REDIS_PASSWORD',
        label: 'Senha de Autenticação (AUTH)',
        type: 'password',
        defaultValue: 'RedisSecretKey2026!',
        placeholder: '••••••••',
        description: 'Deixe preenchido para proteger o Redis com senha.',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `REDIS_PASSWORD=${values.REDIS_PASSWORD || 'RedisSecretKey2026!'}\n` +
      `REDIS_ARGS=--requirepass ${values.REDIS_PASSWORD || 'RedisSecretKey2026!'}`,
    generateConnectionString: (values, containerName) =>
      `redis://:${encodeURIComponent(values.REDIS_PASSWORD || '')}@${containerName}:6379`,
  },
  {
    id: 'rabbitmq',
    name: 'RabbitMQ 3 (com Web Management)',
    category: 'cache_queue',
    categoryLabel: 'Cache & Filas',
    description: 'Message broker para filas assíncronas (AMQP) com painel web de gerenciamento.',
    iconName: 'Send',
    defaultImage: 'rabbitmq:3-management-alpine',
    defaultPort: 15672, // Porta do painel Web para o Traefik
    defaultContainerName: 'rabbitmq-srv',
    isWebUI: true,
    suggestedDomainPrefix: 'rabbit',
    fields: [
      {
        key: 'RABBITMQ_DEFAULT_USER',
        label: 'Usuário do Painel/AMQP',
        type: 'text',
        defaultValue: 'rabbit_admin',
        placeholder: 'rabbit_admin',
        required: true,
      },
      {
        key: 'RABBITMQ_DEFAULT_PASS',
        label: 'Senha do Painel/AMQP',
        type: 'password',
        defaultValue: 'RabbitPass@2026',
        placeholder: '••••••••',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `RABBITMQ_DEFAULT_USER=${values.RABBITMQ_DEFAULT_USER || 'rabbit_admin'}\n` +
      `RABBITMQ_DEFAULT_PASS=${values.RABBITMQ_DEFAULT_PASS || 'RabbitPass@2026'}`,
    generateConnectionString: (values, containerName) =>
      `amqp://${values.RABBITMQ_DEFAULT_USER || 'rabbit_admin'}:${encodeURIComponent(values.RABBITMQ_DEFAULT_PASS || '')}@${containerName}:5672`,
  },

  // ---------------------------------------------------------------------------
  // 3. FERRAMENTAS WEB, S3 STORAGE & AUTOMAÇÃO
  // ---------------------------------------------------------------------------
  {
    id: 'minio',
    name: 'MinIO S3 (Armazenamento de Objetos)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Armazenamento de arquivos compatível 100% com a API AWS S3 e console web.',
    iconName: 'HardDrive',
    defaultImage: 'minio/minio:latest',
    defaultPort: 9001, // Porta do Console Web
    defaultContainerName: 'minio-s3',
    isWebUI: true,
    suggestedDomainPrefix: 's3',
    fields: [
      {
        key: 'MINIO_ROOT_USER',
        label: 'Access Key (Usuário)',
        type: 'text',
        defaultValue: 'minioadmin',
        placeholder: 'minioadmin',
        required: true,
      },
      {
        key: 'MINIO_ROOT_PASSWORD',
        label: 'Secret Key (Senha - min. 8 chars)',
        type: 'password',
        defaultValue: 'MinioMaster2026!',
        placeholder: '••••••••',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `MINIO_ROOT_USER=${values.MINIO_ROOT_USER || 'minioadmin'}\n` +
      `MINIO_ROOT_PASSWORD=${values.MINIO_ROOT_PASSWORD || 'MinioMaster2026!'}\n` +
      `MINIO_SERVER_ARGS=server /data --console-address ":9001"`,
    generateConnectionString: (values, containerName) =>
      `Endpoint S3 API: http://${containerName}:9000 (Access: ${values.MINIO_ROOT_USER}, Secret: ${values.MINIO_ROOT_PASSWORD})`,
  },
  {
    id: 'pgadmin',
    name: 'pgAdmin 4 (Web GUI PostgreSQL)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Interface web visual para administrar bancos PostgreSQL diretamente no navegador.',
    iconName: 'Monitor',
    defaultImage: 'dpage/pgadmin4:latest',
    defaultPort: 80,
    defaultContainerName: 'pgadmin-web',
    isWebUI: true,
    suggestedDomainPrefix: 'pgadmin',
    fields: [
      {
        key: 'PGADMIN_DEFAULT_EMAIL',
        label: 'E-mail de Login no pgAdmin',
        type: 'text',
        defaultValue: 'admin@bla.com.br',
        placeholder: 'admin@meudominio.com',
        required: true,
      },
      {
        key: 'PGADMIN_DEFAULT_PASSWORD',
        label: 'Senha de Acesso',
        type: 'password',
        defaultValue: 'PgAdminPass2026!',
        placeholder: '••••••••',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `PGADMIN_DEFAULT_EMAIL=${values.PGADMIN_DEFAULT_EMAIL || 'admin@bla.com.br'}\n` +
      `PGADMIN_DEFAULT_PASSWORD=${values.PGADMIN_DEFAULT_PASSWORD || 'PgAdminPass2026!'}\n` +
      `PGADMIN_CONFIG_SERVER_MODE=False`,
  },
  {
    id: 'n8n',
    name: 'n8n (Automação de Workflows)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Plataforma líder de automação de fluxos, webhooks e integrações de APIs.',
    iconName: 'Workflow',
    defaultImage: 'n8nio/n8n:latest',
    defaultPort: 5678,
    defaultContainerName: 'n8n-workflows',
    isWebUI: true,
    suggestedDomainPrefix: 'n8n',
    fields: [
      {
        key: 'N8N_BASIC_AUTH_USER',
        label: 'Usuário Básico',
        type: 'text',
        defaultValue: 'admin',
        placeholder: 'admin',
        required: true,
      },
      {
        key: 'N8N_BASIC_AUTH_PASSWORD',
        label: 'Senha Básica',
        type: 'password',
        defaultValue: 'N8NWorkflow2026!',
        placeholder: '••••••••',
        required: true,
      },
    ],
    generateEnv: (values) =>
      `N8N_BASIC_AUTH_ACTIVE=true\n` +
      `N8N_BASIC_AUTH_USER=${values.N8N_BASIC_AUTH_USER || 'admin'}\n` +
      `N8N_BASIC_AUTH_PASSWORD=${values.N8N_BASIC_AUTH_PASSWORD || 'N8NWorkflow2026!'}\n` +
      `N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true`,
  },
  {
    id: 'hello-world',
    name: 'Hello World (Nginx Visual)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Página web visual ultraleve e instantânea para testar e validar o roteamento de domínios no Traefik.',
    iconName: 'Globe',
    defaultImage: 'nginxdemos/hello:latest',
    defaultPort: 80,
    defaultContainerName: 'hello-world-web',
    isWebUI: true,
    suggestedDomainPrefix: 'hello',
    fields: [],
    generateEnv: () => '# Hello World Nginx Web',
  },
  {
    id: 'whoami',
    name: 'Traefik Whoami (Headers & IP)',
    category: 'tools_web',
    categoryLabel: 'Ferramentas Web',
    description: 'Serviço oficial do Traefik que exibe Host, Headers, IP do cliente e detalhes de rede para teste de domínio.',
    iconName: 'Zap',
    defaultImage: 'traefik/whoami:latest',
    defaultPort: 80,
    defaultContainerName: 'whoami-test',
    isWebUI: true,
    suggestedDomainPrefix: 'whoami',
    fields: [],
    generateEnv: () => '# Traefik Whoami Test Service',
  },
];
