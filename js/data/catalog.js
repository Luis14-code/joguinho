/* ============================================================================
   CATÁLOGO DE EQUIPAMENTOS
   ----------------------------------------------------------------------------
   Módulos, infraestrutura e integração são comprados "por frota" (não por
   robô). Simplifica a UI e o modelo mental sem perder didática.
   O campo "kind" é usado pela simulação: AGVs dependem de guia física e não
   funcionam em terreno aberto.
   ========================================================================== */

export const CATALOG = {
  robots: [
    { id: 'agv_simples', name: 'AGV Simples', cost: 120, kind: 'agv',
      desc: 'Robô guiado por trilha física. Barato e confiável em rotas fixas, inútil fora delas.' },
    { id: 'agv_reforcado', name: 'AGV Reforçado', cost: 170, kind: 'agv',
      desc: 'AGV com maior capacidade de carga. Também depende de guia física.' },
    { id: 'amr_padrao', name: 'AMR Padrão', cost: 200, kind: 'amr',
      desc: 'Robô Móvel Autônomo com SLAM básico. Bom em ambientes estruturados.' },
    { id: 'amr_offroad', name: 'AMR Off-road', cost: 280, kind: 'amr',
      desc: 'AMR robusto para terreno irregular. Sensores reforçados e tração adequada.' },
  ],

  modules: [
    // O braço é módulo: instalado sobre os robôs móveis, NÃO conta como robô.
    { id: 'braco', name: 'Braço Robótico', cost: 180,
      desc: 'Manipulador articulado instalado sobre os robôs móveis. Permite pegar, posicionar e acoplar cargas.' },
    { id: 'camera', name: 'Câmera Estéreo', cost: 40,
      desc: 'Visão de profundidade para detecção de obstáculos.' },
    { id: 'lidar', name: 'LiDAR', cost: 90,
      desc: 'Varredura 3D de alta precisão. Essencial para SLAM em terreno desconhecido.' },
    { id: 'imu', name: 'IMU', cost: 30,
      desc: 'Inércia e orientação. Ajuda localização quando outros sensores falham.' },
    { id: 'ultra', name: 'Ultrassônico', cost: 25,
      desc: 'Detector de curto alcance. Bom para evitar colisão próxima.' },
    { id: 'bateria', name: 'Módulo de Bateria Extra', cost: 60,
      desc: 'Dobra a autonomia energética da frota.' },
    { id: 'redundancia', name: 'Kit de Redundância', cost: 80,
      desc: 'Peças e procedimentos de reparo em campo.' },
    { id: 'relay', name: 'Antena de Relay', cost: 70,
      desc: 'Comunicação de longa distância via satélite orbital.' },
  ],

  infra: [
    { id: 'guias', name: 'Guias Físicas no Terreno', cost: 50,
      desc: 'Trilhos magnéticos instalados em rota fixa. Obrigatório para operar AGVs.' },
    { id: 'estacao', name: 'Estação de Recarga Avançada', cost: 120,
      desc: 'Recarga rápida em campo. Reduz risco de bateria crítica.' },
  ],

  integration: [
    { id: 'wms', name: 'Módulo de Inventário (WMS)', cost: 100,
      desc: 'Gestão do inventário da base. Sabe o que tem, onde está, e o que falta.' },
    { id: 'mes', name: 'Módulo de Ordens de Operação (MES)', cost: 120,
      desc: 'Sequencia e coordena as operações da frota. Garante ordem correta de execução.' },
    { id: 'erp', name: 'Módulo de Recursos (ERP)', cost: 90,
      desc: 'Planeja recursos, custos operacionais e rotas eficientes.' },
  ],
};

/** Lookup rápido por id, para qualquer categoria. */
export const CATALOG_INDEX = {};
Object.values(CATALOG).flat().forEach((item) => { CATALOG_INDEX[item.id] = item; });

/** Itens cuja utilidade é estrutural (julgados pela frota, não pelos riscos). */
export const STRUCTURAL_ITEMS = ['guias', 'braco'];
