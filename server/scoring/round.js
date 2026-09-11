// 数值四舍五入工具（避免浮点尾差影响快照测试）。
export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function round4(n) {
  return Math.round(n * 10000) / 10000;
}
