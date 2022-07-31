export default class HistoryController {
  private readonly size: number;
  private readonly persistent: string | undefined;

  private entries: string[];
  private temporaries: (string | undefined)[] = [];
  private cursor = 0;

  constructor(size: number, persistent: string | undefined = undefined) {
    this.size = size;
    this.persistent = persistent;

    this.entries = [];
    if (persistent !== undefined) {
      try {
        this.entries = JSON.parse(
          window.localStorage.getItem(persistent) ?? ""
        );
      } catch {}
    }
    this.resetCursor();
  }

  rewind(newEntry: string | undefined = undefined) {
    if (
      newEntry !== undefined &&
      newEntry.trim() !== "" &&
      newEntry !== this.entries[this.entries.length - 1]
    ) {
      this.entries.push(newEntry);
      if (this.entries.length > this.size) {
        this.entries.splice(0, this.entries.length - this.size);
      }
      if (this.persistent !== undefined) {
        window.localStorage.setItem(
          this.persistent,
          JSON.stringify(this.entries)
        );
      }
    }
    this.resetCursor();
  }

  getPrevious(current: string) {
    this.temporaries[this.cursor] = current;
    const entry =
      this.temporaries[this.cursor - 1] ?? this.entries[this.cursor - 1];
    if (this.cursor > 0) {
      this.cursor--;
    }
    return entry;
  }

  getNext(current: string) {
    this.temporaries[this.cursor] = current;
    const entry =
      this.temporaries[this.cursor + 1] ?? this.entries[this.cursor + 1];
    if (this.cursor < this.entries.length) {
      this.cursor++;
    }
    return entry;
  }

  private resetCursor() {
    this.cursor = this.entries.length;
    this.temporaries = [...this.entries.map(() => undefined), undefined];
  }
}
