# Xterm.js local controller

A skeleton implementation for in-browser handling of input from an xterm.js terminal, with the following features:

 - navigation within and editing of the current input line;
 - line-by-line processing of pasted text;
 - ctrl+c to discard the current input;
 - navigation through local history using up and down arrow keys;
 - correct navigation through wide Unicode characters.

The structure of this project is based roughly on the outdated implementation [local-echo](https://github.com/wavesoft/local-echo).

## Usage

Install as an ES6 module using `npm install --save xterm-local-skeleton`.

### Initialisation

```typescript
  import TerminalController from "xterm-local-skeleton";

  const terminal = new TerminalController({ ...XtermOptions });
  terminal.connect(document.getElementById("terminal"));
```

### Writing output

`TerminalController.write` and `TerminalController.writeln` are async functions that resolve when the terminal flushes. For maximal efficiency, they can be called consecutively without waiting for the previous call to resolve. The string is written to the terminal as UTF16-encoded text with raw [escape sequences supported by xterm.js](https://xtermjs.org/docs/api/vtfeatures/).

```typescript
  terminal.writeln("Hello, world!");
  terminal.writeln("\x1b[31;1mSome warning!\x1b[0m");
  terminal.write("Welcome!\r\n");  // CRLF line breaks are required as terminal escape sequences
```

### Handling input

The terminal can be supplied with an async command handler. All inputs (even empty ones) will be delegated to the handler. The handler is allowed to emit text to the terminal asynchronously and does not need to wait for the terminal to flush before exiting.

```typescript
  terminal.setHandler(async (input) => {
    if (input.trim() !== "") {
      terminal.writeln(`Hello, ${input}!`);
    }
  });
```

### Command line prompt

```typescript
  terminal.setPrompt("localhost$ ");
  terminal.setPrompt(() => `${getName()}$ `);  // allows computed prompts
```

### History configurations

Additional options can be used to configure a persistent history storage in the browser's local storage:

```typescript
  const terminal = new TerminalController({
    ...XtermOptions,
    historySize: 100,  // maximum number of entries kept in history
    persistentHistory: "history"  // stores history in local storage under this key
  });
```

