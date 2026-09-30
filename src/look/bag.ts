// コースごとに作った形状・材質・画像をまとめて持ち、作り直すときに解放する。
export class Bag {
  private items = new Set<{ dispose(): void }>();
  add<T extends { dispose(): void }>(item: T): T {
    this.items.add(item);
    return item;
  }
  dispose() {
    for (const item of this.items) item.dispose();
    this.items.clear();
  }
}
