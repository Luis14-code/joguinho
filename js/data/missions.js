/* ============================================================================
   MISSÕES
   ----------------------------------------------------------------------------
   Cada missão define narrativa, terreno, requisitos e riscos declarados.
   Regra de redação dos briefings: descrever a NECESSIDADE e o CONTEXTO,
   nunca o nome do equipamento/sistema que resolve.

   Campos de um risco:
     probability  — chance de se realizar se não houver mitigação
     mitigatedBy  — itens que eliminam o risco (todos, exceto se anyOf)
     anyOf        — basta UM dos mitigadores
     secondary    — mitigação parcial (corta a probabilidade pela metade)
     impact       — { progress, eff, robotLost }
   ========================================================================== */

export const MISSIONS = [
  {
    id: 'logistica',
    code: 'LOG-01',
    title: 'Logística Inter-Bases',
    terrain: 'Corredor estruturado',
    budget: 1000,
    distance: '4,2 km',
    tagline: 'Transportar insumos entre a Base Alfa e o Galpão Beta.',
    tags: ['Rota fixa', 'Fluxo de materiais', 'Frota'],
    narrative: [
      'Um corredor pressurizado liga a Base Alfa ao Galpão Beta, a 4,2 km de distância. Durante o próximo ciclo marciano, 20 contêineres precisam ir da Alfa para a Beta: insumos biológicos, peças de reposição e consumíveis da tripulação.',
      'A rota é plana, demarcada e não muda de um dia para o outro. Em ambientes previsíveis assim, nem sempre o robô mais sofisticado é o mais adequado, mas alguns tipos de robô só funcionam se o caminho for preparado antes para eles.',
      'O desafio aqui não é o terreno, é a <b>informação</b>: se ninguém sabe exatamente o que está armazenado, onde está e o que já foi enviado, os robôs recolhem a carga errada e repetem viagens. O corredor também é estreito, e vários robôs circulando nele precisam perceber uns aos outros a tempo.',
      'A Comandante quer os 20 contêineres entregues com o menor número de viagens possível e sem incidentes no corredor.',
    ],
    hint: 'Dica: Rotas que nunca mudam permitem soluções mais simples e baratas, desde que o caminho esteja pronto para recebê-las. E carga certa no lugar certo depende mais de informação do que de motor.',
    requirements: { minTotalRobots: 2, openTerrain: false, requiresArm: false },
    risks: [
      { id: 'retrabalho_wms', desc: 'Retrabalho por carga errada recolhida no galpão',
        probability: 0.75, mitigatedBy: ['wms'],
        impact: { progress: -20, eff: -15 } },
      { id: 'colisao', desc: 'Colisão entre robôs no corredor',
        probability: 0.50, mitigatedBy: ['lidar', 'ultra'], anyOf: true,
        impact: { progress: -10, robotLost: 1 } },
      { id: 'rota_ineficiente', desc: 'Viagens desnecessárias por rota mal planejada',
        probability: 0.40, mitigatedBy: ['mes', 'erp'], anyOf: true,
        impact: { progress: -10, eff: -10 } },
      { id: 'quebra_mecanica', desc: 'Quebra mecânica em serviço prolongado',
        probability: 0.35, mitigatedBy: ['redundancia'],
        impact: { progress: -8, robotLost: 1 } },
    ],
    mapLabels: { origin: 'Base Alfa', destination: 'Galpão Beta' },
  },

  {
    id: 'mineracao',
    code: 'MIN-02',
    title: 'Mineração de Regolito',
    terrain: 'Cânion aberto, terreno irregular',
    budget: 1000,
    distance: '8 km (ida)',
    tagline: 'Coletar 500 kg de regolito no Cânion Oeste.',
    tags: ['Terreno aberto', 'Autonomia energética', 'Frota'],
    narrative: [
      'O Cânion Oeste tem regolito rico em óxidos metálicos, matéria-prima para a usina de processamento. A missão é coletar 500 kg no fundo do cânion e trazer até a Base Alfa: 8 km de terreno não estruturado, com inclinações, areia fofa e pedras soltas.',
      'Não existe trilha, marcação ou caminho preparado, e instalar qualquer coisa ao longo do cânion é inviável. A frota precisa se deslocar por conta própria e aguentar um terreno que não perdoa robôs projetados para pisos regulares.',
      'Cada viagem soma 16 km de ida e volta, com subidas. Um robô que para no fundo do cânion vira custo de resgate. Operações longas e abertas como esta também costumam estourar os custos operacionais quando ninguém acompanha o consumo de recursos.',
    ],
    hint: 'Dica: No cânion não há o que seguir: cada robô precisa enxergar o terreno e saber onde está sozinho. E, numa jornada longa, o que costuma acabar primeiro não é o caminho.',
    requirements: { minTotalRobots: 3, openTerrain: true, requiresArm: false },
    risks: [
      { id: 'bateria_critica', desc: 'Bateria crítica em pelo menos 1 robô',
        probability: 0.70, mitigatedBy: ['bateria', 'estacao'], anyOf: true,
        impact: { progress: -15, robotLost: 1 } },
      { id: 'perda_localizacao', desc: 'Perda de localização em terreno irregular',
        probability: 0.60, mitigatedBy: ['lidar'], secondary: ['imu'],
        impact: { progress: -20, robotLost: 1 } },
      { id: 'atolamento_amr_padrao', desc: 'Robô atolado por falta de tração adequada',
        probability: 0.50, mitigatedBy: ['amr_offroad_only'],
        impact: { progress: -15, robotLost: 1 } },
      { id: 'estouro_erp', desc: 'Estouro de recursos operacionais no campo',
        probability: 0.45, mitigatedBy: ['erp'],
        impact: { eff: -20 } },
      { id: 'quebra_terreno', desc: 'Quebra por abrasão em peças expostas',
        probability: 0.35, mitigatedBy: ['redundancia'],
        impact: { progress: -10, robotLost: 1 } },
    ],
    mapLabels: { origin: 'Base Alfa', destination: 'Cânion Oeste' },
  },

  {
    id: 'habitat',
    code: 'HAB-03',
    title: 'Montagem do Habitat H-7',
    terrain: 'Plataforma preparada',
    budget: 1000,
    distance: '600 m',
    tagline: 'Sequenciar a montagem dos 5 módulos do habitat H-7.',
    tags: ['Montagem', 'Sequenciamento', 'Manipulação'],
    narrative: [
      'O habitat H-7 chegou em 5 módulos pré-fabricados. Eles precisam ser conectados em ordem específica (base, piso, laterais em sequência, teto); uma sequência errada força retrabalho e pode inutilizar peças de encaixe.',
      'A tarefa combina <b>transporte</b> (levar cada módulo do galpão ao local de montagem) com <b>manipulação</b> (acoplar os módulos na posição e orientação certa). É necessário que os robôs envolvidos na missão possuam meios de fazer essa manipulação.',
      'O erro mais comum em montagem robótica é a falta de sequenciamento. É necessário que haja coordenação da ordem das operações, para não resultar em peças em locais errados esperando por outras que ainda nem chegaram.',
    ],
    hint: 'Dica: Há sistemas que ajudam na coordenação de operações e inventário.',
    requirements: { minTotalRobots: 2, openTerrain: false, requiresArm: true },
    risks: [
      { id: 'sequencia_errada', desc: 'Erro na ordem de acoplamento dos módulos',
        probability: 0.80, mitigatedBy: ['mes'],
        impact: { progress: -30, eff: -15 } },
      { id: 'inventario_falha', desc: 'Módulos no galpão com rastreio incorreto',
        probability: 0.50, mitigatedBy: ['wms'],
        impact: { progress: -15, eff: -10 } },
      { id: 'comunicacao', desc: 'Falha de comunicação entre braço e transportadores',
        probability: 0.45, mitigatedBy: ['relay'],
        impact: { progress: -15 } },
      { id: 'acoplamento_falho', desc: 'Acoplamento com desalinhamento',
        probability: 0.40, mitigatedBy: ['camera', 'lidar'], anyOf: true,
        impact: { progress: -10, robotLost: 1 } },
      { id: 'estouro_horas', desc: 'Operação se arrasta além do previsto',
        probability: 0.35, mitigatedBy: ['erp'],
        impact: { eff: -15 } },
    ],
    mapLabels: { origin: 'Galpão de Módulos', destination: 'Base H-7' },
  },

  {
    id: 'resgate',
    code: 'SAR-04',
    title: 'Resgate do Rover Endurance',
    terrain: 'Zona desconhecida, sem mapeamento prévio',
    budget: 1000,
    distance: '~12 km (estimada)',
    tagline: 'Localizar o rover tripulado Endurance, imobilizado em zona não mapeada.',
    tags: ['Zona desconhecida', 'Localização', 'Comunicação'],
    narrative: [
      'O rover tripulado Endurance perdeu contato há 14 horas em região fora da zona operacional. Última telemetria aponta para uma cratera a cerca de 12 km, mas a área não tem mapeamento prévio e a comunicação com a Base Alfa é instável.',
      'Esta é provavelmente uma das missões mais complicadas que a sua frota poderá passar. Terreno desconhecido significa que a frota precisa <b>mapear enquanto navega</b>, em uma região sem GPS e com paredões que quebram sinal de rádio.',
      'O objetivo é dual: <b>localizar</b> o Endurance (considere o alcance que os sensores precisarão ter) e <b>rebocá-lo</b> até um ponto onde a equipe médica possa resgatar a tripulação. Perder robôs no caminho significa perder sensores e capacidade de reboque.',
    ],
    hint: 'Dica: Nenhum robô volta de zona não mapeada sem conseguir se orientar sozinho. Nenhuma operação a 12 km da base sobrevive sem um canal confiável com os sistemas da base.',
    requirements: { minTotalRobots: 2, openTerrain: true, requiresArm: false },
    risks: [
      { id: 'robo_perdido', desc: 'Robô perdido em zona não mapeada',
        probability: 0.65, mitigatedBy: ['lidar'], secondary: ['imu'],
        impact: { progress: -25, robotLost: 1 } },
      { id: 'bateria_critica_sar', desc: 'Bateria crítica em operação estendida',
        probability: 0.60, mitigatedBy: ['bateria'],
        impact: { progress: -15, robotLost: 1 } },
      { id: 'comm_blackout', desc: 'Blackout de comunicação com a Base Alfa',
        probability: 0.55, mitigatedBy: ['relay'],
        impact: { progress: -20, eff: -10 } },
      { id: 'reboque_falhou', desc: 'Falha mecânica no reboque do rover',
        probability: 0.50, mitigatedBy: ['redundancia'],
        impact: { progress: -30 } },
      { id: 'rota_cega', desc: 'Rota mal planejada em ausência de sistema que ajude a gerenciar recursos',
        probability: 0.35, mitigatedBy: ['erp'],
        impact: { eff: -15 } },
    ],
    mapLabels: { origin: 'Base Alfa', destination: 'Cratera Desconhecida' },
  },
];

export const MISSION_INDEX = {};
MISSIONS.forEach((m) => { MISSION_INDEX[m.id] = m; });
