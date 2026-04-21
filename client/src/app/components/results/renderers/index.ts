/**
 * Renderer Registry Bootstrap
 * ===========================
 * 导入所有渲染器模块，触发各自的 registerArtifactRenderer() 调用。
 * 新增任务类型时，只需在此文件添加一行 import。
 */

import "./opportunity-prediction-renderer";
import "./trend-watch-renderer";
import "./viral-breakdown-renderer";
import "./topic-strategy-renderer";
import "./copy-extraction-renderer";
import "./account-diagnosis-renderer";
import "./breakdown-sample-renderer";  // 方案B：低粉爆款样本拆解渲染器
