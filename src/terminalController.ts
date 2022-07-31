import { Terminal, ITerminalOptions, IDisposable } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebglAddon } from "xterm-addon-webgl";
import HistoryController from "./historyController";

import "xterm/css/xterm.css";

const normalizeInput = (input: string) => input.replace(/\r\n|\n/g, "\r");

type InputBufferEntry = { input: string; execute: boolean };

export type TerminalOptions = ITerminalOptions & {
  historySize?: number;
  persistentHistory?: string;
};

export default class TerminalController implements IDisposable {
  readonly terminal: Terminal;

  private readonly fitAddon = new FitAddon();
  private readonly sizeObserver = new ResizeObserver(() => this.fitAddon.fit());

  private history: HistoryController;

  private prompt = () => "$ ";
  private handler = async (_input: string) => {};

  private inputPhase = false;
  private input = "";
  private inputBuffer = new Array<InputBufferEntry>();
  private cursor = 0;

  private disposables = new Array<IDisposable>();

  constructor(config: TerminalOptions = {}) {
    this.terminal = new Terminal(Object.assign({ cursorBlink: true }, config));
    this.terminal.loadAddon(this.fitAddon);

    this.history = new HistoryController(
      config.historySize ?? 100,
      config.persistentHistory
    );

    this.disposables.push(this.terminal.onData((str) => this.onData(str)));
    this.disposables.push(
      this.terminal.onResize(() => {
        if (this.inputPhase) {
          this.renderInput(false, false);
        }
      })
    );

    this.startInputPhase();
  }

  dispose() {
    this.sizeObserver.disconnect();

    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }

  connect(parent: HTMLElement) {
    this.terminal.open(parent);
    try {
      this.terminal.loadAddon(new WebglAddon());
    } catch (error) {
      console.warn("WebGL addon threw an exception during load:", error);
    }

    this.sizeObserver.disconnect();
    this.sizeObserver.observe(parent);
    parent.querySelector(".xterm")?.addEventListener("wheel", (event) => {
      if (this.terminal.buffer.active.baseY > 0) {
        event.preventDefault();
      }
    });
  }

  async setPrompt(prompt: string | (() => string)) {
    if (typeof prompt === "string") {
      this.prompt = () => prompt;
    } else {
      this.prompt = prompt;
    }
    if (this.inputPhase) {
      await this.renderInput(false, false);
    }
  }

  setHandler(handler: (input: string) => Promise<void>) {
    this.handler = handler;
  }

  async write(data: string) {
    await new Promise<void>((resolve) => this.terminal.write(data, resolve));
  }

  async writeln(data: string) {
    await this.write(`${data}\r\n`);
  }

  async writeAll(process: (write: (data: string) => void) => void) {
    let lastWrite: Promise<void> | undefined = undefined;
    const result = process((data) => (lastWrite = this.write(data)));
    if (lastWrite !== undefined) {
      await lastWrite;
    }
    return result;
  }

  private async startInputPhase() {
    if (!this.inputPhase) {
      await this.write(""); // flush the buffer and skip to end of even loop
      if (this.terminal.buffer.active.cursorX > 0) {
        this.write("\r\n");
      }

      let entry = this.inputBuffer.shift();
      while (entry !== undefined) {
        const promise = this.renderInput(true, true, entry.input);
        if (entry.execute) {
          this.run(entry.input);
          return;
        } else {
          await promise;
          entry = this.inputBuffer.shift();
        }
      }
      this.inputPhase = true;
      await this.renderInput(true, false);
    }
  }

  private async renderInput(
    newLine: boolean,
    completing: boolean,
    input: string | undefined = undefined
  ) {
    await this.writeAll((write) => {
      if (!newLine) {
        let wrappedLines = 0;
        while (
          wrappedLines < this.terminal.buffer.active.cursorY &&
          this.terminal.buffer.active.getLine(
            this.terminal.buffer.active.cursorY - wrappedLines
          )?.isWrapped
        ) {
          wrappedLines++;
        }
        write(`\r${"\x1b[K\x1b[F".repeat(wrappedLines)}\x1b[K`);
      }
      write(this.prompt());

      if (input === undefined) {
        write(
          `${this.input.substring(0, this.cursor)}\x1b7${this.input.substring(
            this.cursor
          )}\x1b8`
        );
      } else {
        write(input);
      }
      if (completing) {
        write("\r\n");
      }
    });
  }

  private pushInput(execute: boolean) {
    if (execute) {
      this.history.rewind(this.input);
    } else {
      this.history.rewind();
    }

    let input: string | undefined = undefined;
    if (this.inputPhase) {
      this.inputPhase = false;
      input = this.input;
      this.renderInput(false, true);
    } else {
      this.inputBuffer.push({ input: this.input, execute });
    }
    this.input = "";
    this.cursor = 0;

    if (input !== undefined) {
      if (execute) {
        this.run(input);
      } else {
        this.startInputPhase();
      }
    }
  }

  private onData(str: string) {
    let inputPushed = true;
    if (str.length > 0) {
      if (str.charCodeAt(0) === 0x1b) {
        inputPushed = this.onEscape(str.substring(1));
      } else {
        for (const char of normalizeInput(str)) {
          inputPushed = this.onChar(char);
        }
      }
    }
    if (!inputPushed && this.inputPhase) {
      this.renderInput(false, false);
    }
  }

  private onEscape(sequence: string) {
    switch (sequence) {
      case "[A": // Up arrow
        const previous = this.history.getPrevious(this.input);
        if (previous !== undefined) {
          this.input = previous;
          this.cursor = this.input.length;
        }
        return false;

      case "[B": // Down arrow
        const next = this.history.getNext(this.input);
        if (next !== undefined) {
          this.input = next;
          this.cursor = this.input.length;
        }
        return false;

      case "[D": // Left arrow
        if (this.cursor > 0) {
          this.cursor--;
        }
        return false;

      case "[C": // Right arrow
        if (this.cursor < this.input.length) {
          this.cursor++;
        }
        return false;

      case "[3~": // Delete
        if (this.cursor < this.input.length) {
          this.input =
            this.input.substring(0, this.cursor) +
            this.input.substring(this.cursor + 1);
        }
        return false;

      default:
        console.log(sequence);
        return false;
    }
  }

  private onChar(char: string) {
    const ord = char.charCodeAt(0);
    if (ord < 32 || ord === 0x7f) {
      switch (char) {
        case "\r": // Enter
          this.pushInput(true);
          return true;

        case "\x7f": // Backspace
          if (this.cursor > 0) {
            this.input =
              this.input.substring(0, this.cursor - 1) +
              this.input.substring(this.cursor);
            this.cursor -= 1;
          }
          return false;

        case "\x03": // Ctrl+C
          this.input += "^C";
          this.pushInput(false);
          return true;

        default:
          return false;
      }
    } else {
      this.input =
        this.input.substring(0, this.cursor) +
        char +
        this.input.substring(this.cursor);
      this.cursor += char.length;
      return false;
    }
  }

  private async run(input: string) {
    await this.handler(input);
    this.startInputPhase();
  }
}
