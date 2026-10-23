# Releasing lockgrok

The initial `0.1.0` npm publication is performed manually. Later stable GitHub
releases trigger [.github/workflows/publish.yml](../.github/workflows/publish.yml),
which checks out the release tag, verifies its version, runs `npm run check`, and
publishes to npm with the `latest` dist-tag. GitHub prereleases are skipped.
Already published versions are skipped, including the initial manual release.

## Configure npm trust before the next release

Configure trust when the next version is ready to publish. npm requires the
package to exist, account-level 2FA, and write access to the package. A new trust
configuration must complete its first successful publication within two days.

From this checkout, with npm 11.15.0 or newer:

```sh
npm trust github lockgrok --repo VladimirMarko/lockgrok --file publish.yml --allow-publish
```

Complete npm's interactive authentication. This authorizes the workflow without
storing an npm token in GitHub. Public packages published this way from public
GitHub repositories receive automatic provenance. See npm's
[trusted publishing guide](https://docs.npmjs.com/trusted-publishers/) and
[`npm trust` reference](https://docs.npmjs.com/cli/v11/commands/npm-trust/).

## Publish a stable version

1. Update the version in `package.json` and `package-lock.json`, for example with
   `npm version patch --no-git-tag-version`. Review the changes and run
   `npm run check`.
2. Commit with a Conventional Commit message, push the commit, and confirm GitHub
   validation passes on both supported Node versions.
3. Create an annotated tag `vVERSION` on that commit and push the tag. The tag must
   match `package.json` exactly, for example `v0.1.1` for version `0.1.1`.
4. Create a GitHub release for the existing tag. Describe the user-visible changes
   and any installation or compatibility requirements. Publishing the release
   triggers npm publication; saving a draft does not.
5. Check the Publish to npm workflow result and verify the version on npm. If
   publication fails, resolve the cause and rerun the failed workflow. Never move
   a released tag to different code or attempt to replace an npm version.

The workflow uses Node 24 and npm 11.19.0, runs on a GitHub-hosted runner, and
requests `id-token: write` for OIDC authentication. Ordinary pushes and pull
requests run validation without publishing.
