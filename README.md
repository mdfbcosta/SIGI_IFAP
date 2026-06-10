# 📋 Sistema de Presença Docente — IFAP

Sistema web para registro, fiscalização e acompanhamento da presença docente no Instituto Federal do Amapá (IFAP), Campus Porto Grande.

## 🚀 Tecnologias

- **Front-end**: HTML5, CSS3, JavaScript (Vanilla)
- **Banco de Dados**: [Supabase](https://supabase.com) (PostgreSQL gerenciado)
- **Autenticação**: Supabase Auth (e-mail/senha)
- **Hosting**: GitHub Pages

## 📦 Estrutura do Projeto

```
├── index.html              # Página principal (SPA)
├── app.js                  # Lógica da aplicação
├── style.css               # Estilos da interface
├── supabase-client.js      # Camada de acesso ao banco de dados
├── schema.sql              # Schema do banco (PostgreSQL/Supabase)
├── logo.png                # Logo do sistema
├── .gitignore              # Arquivos ignorados pelo Git
└── README.md               # Este arquivo
```

## 🔧 Configuração

### 1. Banco de Dados (Supabase)
1. Acesse o painel do Supabase do projeto
2. Vá em **SQL Editor** e execute o conteúdo do arquivo `schema.sql`
3. Isso criará todas as tabelas, índices, políticas RLS e dados iniciais

### 2. Autenticação
1. No Supabase, vá em **Authentication > Users**
2. Crie os usuários com os e-mails cadastrados na tabela `usuarios`
3. Após criar cada usuário, copie o UUID gerado e atualize o campo `auth_id` na tabela `usuarios`

### 3. Deploy (GitHub Pages)
1. Faça push do projeto para o GitHub
2. Vá em **Settings > Pages**
3. Selecione a branch `main` e a pasta `/ (root)`
4. O site ficará disponível em `https://mdfbcosta.github.io/SistemaPresencaDocenteIFAP/`

## 👥 Perfis de Acesso

| Perfil | Descrição |
|--------|-----------|
| FISCAL | Fiscal de Sala — realiza a ronda de presença |
| COORD_COLEGIADO | Coordenador de Colegiado — gerencia chefiados |
| COORD_GERAL | Coordenação Geral de Ensino |
| DIR_ENSINO | Direção de Ensino |
| DIR_GERAL | Direção Geral |
| ESTAGIARIO | Estagiário/Admin — acesso total de configuração |

## 📄 Licença

Projeto interno do IFAP — Uso restrito institucional.
