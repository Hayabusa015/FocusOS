# Cortex

A personal focus app and second brain, with **Atlas**, a voice assistant. It is built for one
person with ADHD on one Windows PC.

- **Plan and status:** [`docs/PLAN.md`](docs/PLAN.md)
- **Rules for building it:** [`CLAUDE.md`](CLAUDE.md)
- **Releasing and testing updates:** [`docs/RELEASING.md`](docs/RELEASING.md)

## Install

Download `Cortex-Setup-<version>.exe` from the
[latest release](https://github.com/Hayabusa015/FocusOS/releases/latest) and run it. It installs
for the current user and needs no administrator rights. The installer is unsigned, so Windows
SmartScreen warns the first time: choose **More info**, then **Run anyway**.

After that Cortex finds new versions by itself and offers them in a banner.

Your data lives in `%APPDATA%\Cortex`.

## Develop

```
npx npm@11 install      # Node 24; npm 10 cannot resolve the dependency tree
npm run dev
npm test
```

The full list of commands is in [`CLAUDE.md`](CLAUDE.md).
