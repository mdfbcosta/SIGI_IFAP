# Conceituação: Sistema de Registro e Monitoramento de Presença Docente (IFAP - Porto Grande)

Este documento detalha o fluxo de trabalho para o registro de presença dos professores, visando garantir a transparência, segurança e eficiência no envio de dados para as instâncias superiores.

## 1. Contexto e Objetivo
O Campus Porto Grande (IFAP) necessita de um método seguro para que os fiscais de alunos registrem a presença dos professores em sala de aula, conforme o horário previsto, e que esses dados cheguem de forma íntegra à Direção de Ensino, Coordenadores e, por fim, ao sistema SUAP para fins pedagógicos e de folha de pagamento (PROEN/PROGEP).

## 2. O Fluxo Atual (Stakeholders)

1.  **Fiscais de Alunos (2 por turno):**
    *   Possuem a grade de horários semanal.
    *   Realizam rondas periódicas em cada um dos 5 horários do turno.
    *   Observação passiva: verificam a presença sem interromper a aula.
    *   Registram presença ou falta.

2.  **Diretor Geral de Ensino (DGE):**
    *   Recebe a consolidação diária dos três turnos.
    *   Valida e encaminha para os Coordenadores de Curso.

3.  **Coordenadores de Curso:**
    *   Recebem os dados de suas respectivas áreas.
    *   Realizam o lançamento oficial no sistema SUAP.

4.  **Instâncias Superiores (PROEN e PROGEP):**
    *   **PROEN:** Monitora a qualidade e cumprimento do calendário acadêmico.
    *   **PROGEP:** Processa o pagamento proporcional com base no cumprimento da carga horária.

## 3. Desafios e Oportunidades de Solução

### Desafios Identificados
- **Segurança da Informação:** Garantir que o registro feito pelo fiscal não seja alterado no caminho.
- **Agilidade:** O dado precisa fluir rapidamente para que o lançamento no SUAP não acumule.
- **Confiabilidade:** O registro deve estar estritamente vinculado ao horário oficial gerado (conectando com o Projeto 1).

### Proposta de Funcionalidades (Para Futura Implementação)
- **App de Ronda:** Uma interface simples para o fiscal, onde ele vê apenas as turmas e professores que deveriam estar em aula naquele exato horário.
- **Assinatura Digital/Log:** Cada registro gera uma marca temporal (timestamp) e identificação do fiscal, impedindo contestações.
- **Painel de Consolidação:** O Diretor de Ensino visualiza um "termômetro" do dia, vendo rapidamente quais turmas ficaram sem professor.
- **Relatórios Automatizados:** Geração de arquivos formatados para facilitar a conferência e o lançamento no SUAP pelos coordenadores.

## 4. Integração com o Gerador de Horários
O sistema de presença deve consumir os dados do **Gerador de Horários** para saber exatamente qual professor deve estar em qual sala em cada momento do dia.

---
*Documento de trabalho para o Campus Porto Grande - IFAP.*
