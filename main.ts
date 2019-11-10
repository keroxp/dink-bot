import { upgradePatchVersion } from "./util.ts";

type ReleaseResponse = {
  url: string;
  tag_name: string;
  name: string;
  label: string;
  prerelease: false;
  created_at: string;
  published_at: string;
};

async function hasActivePullRequest(branch: string): Promise<boolean> {
  console.log("Checking active PllRequest...");
  const proc = Deno.run({
    args: ["git", "branch", "-a"],
    stdout: "piped"
  });
  try {
    const output = decoder.decode(await proc.output());
    if (output.match(`remotes/origin/${branch}`)) {
      console.log(`Remote branch ${branch} exists. Skip bumping`);
      return true;
    } else {
      console.log(`No PullRequest found for ${branch}. Continue.`);
      return false;
    }
  } finally {
    proc.close();
  }
}

async function getLatestDenoVersion(): Promise<string> {
  const resp = await fetch(
    "https://api.github.com/repos/denoland/deno/releases"
  );
  if (resp.status === 200) {
    const [latest] = (await resp.json()) as ReleaseResponse[];
    return latest.name;
  } else {
    throw new Error(await resp.text());
  }
}
const decoder = new TextDecoder();
const encoder = new TextEncoder();
async function readTextFile(file: string): Promise<string> {
  const b = await Deno.readFile(file);
  return decoder.decode(b);
}
async function getCurrentDenoVersion(): Promise<string> {
  const t = await readTextFile(".denov");
  return t.trim();
}

async function updateModuleJson(denoVersion: string) {
  const json = await readTextFile("modules.json");
  const mod = JSON.parse(json);
  if (mod["https://deno.land/std"]) {
    console.log(
      "Updating modules.json https://deno.land/std version to " + denoVersion
    );
    mod["https://deno.land/std"]["version"] = "@" + denoVersion;
    Deno.writeFile(
      "modules.json",
      encoder.encode(JSON.stringify(mod, null, "  "))
    );
    console.log("Updated modules.json");
  }
}

async function runDink() {
  await exec([
    "deno",
    "run",
    "-A",
    "https://denopkg.com/keroxp/dink@v0.6.2/main.ts"
  ]);
}

async function runFmt() {
  await exec(["deno", "fmt", "*"]);
}

async function updateDenovFile(denoVersion: string) {
  console.log("Updating .denov to " + denoVersion);
  await Deno.writeFile(".denov", encoder.encode(denoVersion));
  console.log("Updated .denov");
}

async function exec(args: string[]) {
  const proc = Deno.run({ args });
  try {
    const status = await proc.status();
    if (!status.success) {
      throw new Error("run failed: "+args);
    }
  } finally {
    proc.close();
  }
}

type Opts = {
  user: string;
  repo: string;
  token: string;
  denoVersion: string;
};
async function commitChanges({
  branch,
  user,
  repo,
  token,
  message,
  createNewBranch
}: Opts & {
  createNewBranch: boolean;
  branch: string;
  message: string;
}) {
  await exec(["git", "config", "--local", "user.email", "actions@github.com"]);
  await exec(["git", "config", "--local", "user.name", "Github Actions"]);
  if (createNewBranch) {
    await exec(["git", "checkout", "-b", branch]);
  }
  await exec(["git", "add", "."]);
  await exec(["git", "commit", "-m", message]);
  await exec([
    "git",
    "remote",
    "set-url",
    "origin",
    `https://${user}:${token}@github.com/${user}/${repo}.git`
  ]);
  await exec(["git", "push", "origin", branch]);
}

async function createPullRequest({
  user,
  token,
  repo,
  title,
  branch,
  base
}: Opts & {
  title: string;
  branch: string;
  base: string;
}) {
  console.log(
    `Creating PullRequest on https://github.com/${user}/${repo}/pulls`
  );
  const resp = await fetch(
    `https://api.github.com/repos/${user}/${repo}/pulls`,
    {
      method: "POST",
      headers: new Headers({
        authorization: `token ${token}`,
        "content-type": "application/json"
      }),
      body: JSON.stringify({
        title: title,
        head: `${user}:${branch}`,
        base: base
      })
    }
  );
  if (resp.status === 201) {
    console.log("PullRequest Created.");
  } else {
    throw new Error(
      `Failed to create PullRequest: status=${
        resp.status
      }, error=${await resp.text()}`
    );
  }
}

async function checkTests(): Promise<boolean> {
  try {
    await exec(["deno", "-A", "test"]);
    return true;
  } catch (e) {
    return false;
  }
}

async function throwApiErrorIfNotValid(resp: Response, validStatus: number) {
  if (resp.status !== validStatus) {
    throw new Error(`${resp.status}: ${await resp.text()}`);
  }
}

async function getRepoLatestRelease(opts: Opts): Promise<string> {
  const resp = await fetch(
    `https://api.github.com/repos/${opts.user}/${opts.repo}/releases/latest`
  );
  await throwApiErrorIfNotValid(resp, 200);
  const latest = (await resp.json()) as ReleaseResponse;
  return latest.name;
}

async function createRelease(
  opts: Opts & {
    targetBranch: string;
    description: string;
  }
) {
  const latest = await getRepoLatestRelease(opts);
  const nextPatch = upgradePatchVersion(latest);
  const resp = await fetch(
    `https://api.github.com/repos/${opts.user}/${opts.repo}/releases`,
    {
      method: "POST",
      headers: new Headers({
        authorization: `token ${opts.token}`,
        "content-type": "application/json"
      }),
      body: JSON.stringify({
        tag_name: nextPatch,
        target_commitish: opts.targetBranch,
        name: nextPatch,
        body: opts.description,
        draft: false,
        prerelease: false
      })
    }
  );
  await throwApiErrorIfNotValid(resp, 201);
}

async function main() {
  const token = Deno.env("GITHUB_TOKEN");
  const user = Deno.env("GITHUB_USER");
  const repo = Deno.env("GITHUB_REPO");
  if (!user || !token || !repo) {
    console.error("Set GITHUB_TOKEN, GITHUB_USER, GITHUB_REPO");
    Deno.exit(1);
  }
  const current = await getCurrentDenoVersion();
  const latest = await getLatestDenoVersion();
  if (current !== latest) {
    console.log(`Needs Update: current=${current}, latest=${latest}`);
    const headBranch = `botbump-deno@${latest}`;
    const commitMessage = `bump: deno@${latest}`;
    const opts: Opts = {
      user,
      repo,
      token,
      denoVersion: latest
    };
    if (await hasActivePullRequest(headBranch)) {
      Deno.exit(0);
    }
    await updateModuleJson(latest);
    await updateDenovFile(latest);
    await runDink();
    await runFmt();
    console.log("Running tests to check compatibility with new version");
    if (await checkTests()) {
      console.log("Test Passed. Commit changes and publish new release");
      await commitChanges({
        ...opts,
        branch: "master",
        message: commitMessage,
        createNewBranch: false
      });
      await createRelease({
        ...opts,
        targetBranch: "master",
        description: commitMessage
      });
    } else {
      console.log(
        "Test Failed. Check out to head branch and create new PullRequest"
      );
      await commitChanges({
        ...opts,
        branch: headBranch,
        message: commitMessage,
        createNewBranch: true
      });
      await createPullRequest({
        ...opts,
        title: commitMessage,
        base: "master",
        branch: headBranch
      });
    }
    console.log("Workflow completed.");
  } else {
    console.log(`You are using latest Deno: ${latest}`);
  }
  Deno.exit(0);
}

if (import.meta.main) {
  main();
}
