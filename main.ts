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
  await exec(["git", "fetch", "-p"]);
  const proc = Deno.run({
    cmd: ["git", "branch", "-a"],
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
    "https://denopkg.com/keroxp/dink@v0.8.3/main.ts"
  ]);
}

async function runFmt() {
  await exec(["deno", "fmt"]);
}

async function updateDenovFile(denoVersion: string) {
  console.log("Updating .denov to " + denoVersion);
  await Deno.writeFile(".denov", encoder.encode(denoVersion));
  console.log("Updated .denov");
}

async function exec(cmd: string[]) {
  const proc = Deno.run({ cmd });
  try {
    const status = await proc.status();
    if (!status.success) {
      throw new Error("run failed: " + cmd);
    }
  } finally {
    proc.close();
  }
}

type Opts = {
  owner: string;
  repo: string;
  token: string;
  denoVersion: string;
};
async function commitChanges({
  branch,
  owner,
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
    `https://${owner}:${token}@github.com/${owner}/${repo}.git`
  ]);
  await exec(["git", "push", "origin", branch]);
}

async function createPullRequest({
  owner,
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
    `Creating PullRequest on https://github.com/${owner}/${repo}/pulls`
  );
  const resp = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/pulls`,
    {
      method: "POST",
      headers: new Headers({
        authorization: `token ${token}`,
        "content-type": "application/json"
      }),
      body: JSON.stringify({
        title: title,
        head: `${owner}:${branch}`,
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

async function main() {
  const [repository, token] = Deno.args;
  if (!token || !repository) {
    throw new Error("Usage: main.ts token123456 :owner/:repository");
  }
  if (!repository.match(/^(.+?)\/(.+?)$/)) {
    throw new Error("repository must be :owner/:repo style: " + repository);
  }
  const [owner, repo] = repository.split("/");
  const current = await getCurrentDenoVersion();
  const latest = await getLatestDenoVersion();
  if (current !== latest) {
    console.log(`Needs Update: current=${current}, latest=${latest}`);
    const headBranch = `botbump-deno@${latest}`;
    const commitMessage = `bump: deno@${latest}`;
    const opts: Opts = {
      owner,
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
    console.log("Workflow completed.");
  } else {
    console.log(`You are using latest Deno: ${latest}`);
  }
}

if (import.meta.main) {
  main()
    .then(() => {
      Deno.exit(0);
    })
    .catch(e => {
      console.error(e.message);
      Deno.exit(1);
    });
}
