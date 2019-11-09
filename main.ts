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
  const status = await Deno.run({ args }).status();
  if (!status.success) {
    throw new Error("run failed");
  }
}

async function commitChanges(denoVersion: string, branch: string) {
  await exec(["git", "config", "--local", "user.email", "actions@github.com"]);
  await exec(["git", "config", "--local", "user.name", "Github Actions"]);
  await exec(["git", "checkout", "-b", branch]);
  await exec(["git", "add", "."]);
  await exec(["git", "commit", "-m", `bump: deno@${denoVersion}`]);
  await exec(["git", "push", "origin", branch]);
}

async function createPullRequest({
  user,
  base,
  title,
  token,
  repo,
  branch
}: {
  user: string;
  repo: string;
  token: string;
  title: string;
  base: string;
  branch: string;
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
    const branch = `botbump-deno@${latest}`;
    if (await hasActivePullRequest(branch)) {
      Deno.exit(0);
    }
    await updateModuleJson(latest);
    await updateDenovFile(latest);
    await runDink();
    await runFmt();
    await commitChanges(latest, branch);
    await createPullRequest({
      user,
      repo,
      token,
      branch,
      title: `bump: deno@${latest}`,
      base: "master"
    });
    console.log("Workflow completed.");
  } else {
    console.log(`You are using latest Deno: ${latest}`);
  }
}

main();
