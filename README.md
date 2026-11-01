# mod-publish-actions

GitHub Actions for publishing Minecraft mods to CurseForge.

| Action              | Purpose                               |
| ------------------- | ------------------------------------- |
| `curseforge/upload` | Upload a file to a CurseForge project |

CurseForge has no official gallery API, so its gallery stays manual through the Images tab in the Authors Console, and it has no documented way to automate videos.

## Usage

Run the action once per file, usually from a matrix. Pin it to a full commit SHA, because tags can be moved.

```yaml
- uses: sparten11740/mod-publish-actions/curseforge/upload@<commit-sha>
  with:
    token: ${{ secrets.CURSEFORGE_TOKEN }}
    project-id: ${{ vars.CURSEFORGE_PROJECT_ID }}
    file: jars/my-mod-*+${{ matrix.minecraft }}-${{ matrix.loader }}.jar
    game-versions: ${{ matrix.minecraft }}
    loaders: ${{ matrix.loader }}
    environment: client
    java-versions: ${{ matrix.java }}
    release-type: alpha
    changelog-file: CHANGELOG.md
    dependencies: fabric-api:required
```

[`curseforge/upload/action.yml`](curseforge/upload/action.yml) documents its inputs and outputs.

## Re-running an upload

`curseforge/upload` can't tell whether a file was already uploaded, because CurseForge's documented upload API can't list a project's files. **Re-running a job uploads every file again**, so after a partial failure, re-run only the failed jobs.

## Development

See [AGENTS.md](AGENTS.md) for commands and conventions.

## License

[MIT](LICENSE). The bundle in each action's `dist/` also contains third-party code under its own license, listed in `dist/THIRD_PARTY_LICENSES.txt` next to it.
