// 简单的内存并发队列：限制同时进行的评估数，超出则排队
const MAX_CONCURRENCY = Number(process.env.MAX_CONCURRENCY || 5);
const MAX_QUEUE = Number(process.env.MAX_QUEUE || 50);

let active = 0;
const waiting = [];

export function queueStats() {
  return { active, waiting: waiting.length, maxConcurrency: MAX_CONCURRENCY };
}

// 获取一个执行槽位；resolve 一个 release 函数
// onWait(position) 在需要排队时回调一次（给出排队位置）
export function acquire(onWait) {
  return new Promise((resolve, reject) => {
    const makeRelease = () => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        active--;
        const next = waiting.shift();
        if (next) next();
      };
    };

    if (active < MAX_CONCURRENCY) {
      active++;
      resolve(makeRelease());
      return;
    }

    if (waiting.length >= MAX_QUEUE) {
      reject(new Error("当前排队人数过多，请稍后再试"));
      return;
    }

    const entry = () => {
      active++;
      resolve(makeRelease());
    };
    waiting.push(entry);
    if (onWait) onWait(waiting.length);
  });
}
