# Fluxo de Projetos

Sistema interno para receber solicitações, revisar prioridades, estimar horas e acompanhar o fluxo de projetos.

## Publicação

O site é estático e publicado pelo GitHub Pages a partir da raiz da branch `main`.

## Infraestrutura

- Front-end: HTML, CSS e JavaScript.
- Banco, autenticação e PDFs: Supabase.
- A chave presente em `app.js` é uma chave publicável de navegador. O acesso aos dados é protegido por Row Level Security (RLS).
- O esquema usa somente objetos com prefixo `fluxo_` e o bucket `fluxo-project-pdfs`, mantendo separação lógica do sistema existente.

## Fluxo

1. Qualquer pessoa registra uma solicitação sem login.
2. Engenharia ou Produção revisa os dados e aprova.
3. O projetista informa as horas previstas.
4. O projeto entra na fila de execução e no calendário.
5. Manutenção e Diretoria possuem acesso somente para leitura.

O repositório não armazena senhas nem chaves administrativas.
