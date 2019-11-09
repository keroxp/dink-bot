type ReleaseResponse = {
  url: string;
  tag_name: string;
  name: string;
  label: string;
  prerelease: false;
  created_at: string;
  published_at: string;
};

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
    "-r",
    "https://denopkg.com/keroxp/dink/main.ts"
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

async function commitChanges(denoVersion: string) {
  await exec([
    "git",
    "config",
    "--local",
    "user.email",
    "kerokerokerop@gmail.com"
  ]);
  await exec(["git", "config", "--local", "user.name", "keroxp-bot"]);
  await exec(["git", "checkout", "-b", `botbump-deno@${denoVersion}`]);
  await exec(["git", "add", "."]);
  await exec([
    "git",
    "commit",
    "-m",
    `"bump: deno@${denoVersion}", std@${denoVersion}`
  ]);
  // await exec(["git", "push", "origin", `botbump-deno@${denoVersion}`]);
}

async function main() {
  const current = await getCurrentDenoVersion();
  const latest = await getLatestDenoVersion();
  if (current !== latest) {
    console.log(`Needs Update: current=${current}, latest=${latest}`);
    await updateModuleJson(latest);
    await updateDenovFile(latest);
    await runDink();
    await runFmt();
    await commitChanges(latest);
  } else {
    console.log(`You are using latest Deno: ${latest}`);
  }
}

main();
