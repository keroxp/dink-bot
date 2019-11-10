export function upgradePatchVersion(semver: string): string {
  const m = semver.match(/^(v?\d+\.\d+\.)(\d+)/);
  if (m) {
    const [_, prefix, patch] = m;
    const nextPatch = parseInt(patch) + 1;
    return prefix + nextPatch;
  }
  throw new Error("given tag is not valid semver: " + semver);
}
