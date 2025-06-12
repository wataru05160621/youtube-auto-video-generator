export interface StageConfig {
  stage: string;
  region: string;
  account?: string;
}

export const stageConfigs: Record<string, StageConfig> = {
  dev: {
    stage: 'dev',
    region: 'ap-northeast-1', // Tokyo
  },
  prod: {
    stage: 'prod',
    region: 'ap-northeast-1', // Tokyo
  }
};

export function getStageConfig(stage: string): StageConfig {
  const config = stageConfigs[stage];
  if (!config) {
    throw new Error(`Unknown stage: ${stage}`);
  }
  return config;
}
