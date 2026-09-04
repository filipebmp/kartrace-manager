# Corrigir geração do plano

## Alterações
- Reconhecer e normalizar o registo `BOX` guardado por versões anteriores, mesmo quando não contém a marca interna de paragem.
- Garantir que **Gerar plano** cria 28 paragens e 29 turnos de condução, distribuindo estes turnos ciclicamente por todos os pilotos disponíveis.
- Manter a compatibilidade com os dados já guardados no dispositivo, sem apagar pilotos ou configurações.

## Validação
- Testar a geração com o estado antigo que atualmente produz um único turno de 1500 minutos.
- Confirmar no ecrã que aparecem vários pilotos, 29 turnos de condução, 28 paragens e um total de 25:00.
