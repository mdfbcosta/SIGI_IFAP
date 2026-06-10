-- ============================================================
-- VINCULAR AUTH_ID — Sistema de Presença Docente IFAP
-- ============================================================
-- Como usar:
-- 1. Abra o Supabase → Authentication → Users
-- 2. Clique em cada usuário para ver o UUID (coluna "UID")
-- 3. Cole o UUID no lugar de 'COLE-O-UUID-AQUI' abaixo
-- 4. Execute no SQL Editor
-- ============================================================

-- DICA RÁPIDA: você pode também copiar todos os UUIDs de uma vez
-- rodando este SELECT na aba Authentication > SQL:
-- SELECT id, email FROM auth.users ORDER BY email;
-- ============================================================

UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'dirgeral.porto@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'den.porto@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'cogen.porto@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'coped.porto@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'agroecologia@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'agronegocio@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'agropecuaria@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'tecnicoadm.porto@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'tecveterinaria@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'engagronomica@ifap.edu.br';
UPDATE usuarios SET auth_id = 'COLE-O-UUID-AQUI' WHERE email = 'medicina.porto@ifap.edu.br';

-- ============================================================
-- VERIFICAÇÃO: rode este SELECT após vincular para confirmar
-- ============================================================
-- SELECT nome, email, perfil, auth_id IS NOT NULL AS vinculado
-- FROM usuarios
-- WHERE tipo_conta = 'FUNCIONAL'
-- ORDER BY perfil, nome;
-- ============================================================
