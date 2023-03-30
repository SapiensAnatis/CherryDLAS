import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  createWriteStream,
} from "fs";
import { join } from "path";
import { cwd } from "process";
import { get } from "https";
import { debug, warning, information, error } from "./log.js";
import { createServer as createServerHttp } from "http";
import { createServer as createServerHttps } from "https";
import { config } from "./config.js";

const OrchisAssetURL = "https://orchis.cherrymint.live/dl";
const BasePath = join(cwd(), "orchis");
if (!existsSync(BasePath)) {
  mkdirSync(BasePath);
}
config.assetpaths.unshift(BasePath);

let createServer = createServerHttp;
const certConf = {};

if (config.ssl) {
  createServer = createServerHttps;
  certConf = {
    key: fs.readFileSync(Configuration["key"]),
    cert: fs.readFileSync(Configuration["cert"]),
  };
}

let ActiveDownloads = 0;

createServer(certConf, (req, res) => {
  debug("Received request to path:", req.url);
  const URLPath = req.url.split("/");

  debug(
    "Split URL into components:",
    URLPath.map((value, index) => ({ value, index }))
  );

  if (URLPath.includes("..")) {
    warning("Directory traversal attack detected.");
    res.writeHead(404);
    res.end("404: File not found");
    return;
  }

  if (URLPath[1] == "test") {
    console.log("Connected!");
    res.end("<p>Connected!</p>");
    return;
  } else if (URLPath[1] == "dl") {
    debug("Dragalia Lost request detected.");
    let Attempt = 1;
    for (let i in config.assetpaths) {
      // "say 'no' to directory traversal attacks" - some guy i'm in a discord server with, probably
      let FilePath = "";

      try {
        if (URLPath[2] == "manifests") {
          FilePath = join(config.assetpaths[i], URLPath[4], URLPath[5]);
        } else {
          FilePath = join(config.assetpaths[i], URLPath[5], URLPath[6]);
        }

        debug(`Attempt ${Attempt}: trying path ${FilePath}`);

        if (!existsSync(FilePath) && Attempt >= config.assetpaths.length) {
          information("File for URL", req.url, "was not found.");
          res.writeHead(404);
          res.end("<p>File not found</p>");
          return;
        } else if (!existsSync(FilePath)) {
          debug("Could not find file at this path.");
          Attempt += 1;
          continue;
        }

        debug("File exists, reading...");
        const File = readFileSync(FilePath);
        res.writeHead(200);
        res.end(File);
        debug("Successfully wrote response.");
        return;
      } catch (err) {
        error("An error occurred while writing the response:", err);
        res.writeHead(500);
        res.end();
        return;
      }
    }
  }
}).listen(config.port);

async function OrchisAssetVer() {
  return new Promise((resolve, reject) => {
    let FinalData = "";
    get("https://orchis.cherrymint.live/assetver", (Response) => {
      Response.on("data", (chunk) => {
        FinalData += chunk;
      });
      Response.on("end", () => {
        resolve(JSON.parse(FinalData));
      });
    }).on("error", (err) => {
      console.error("Error fetching /assetver:", err);
      reject("Error: " + err.message);
    });
  });
}
async function DownloadOrchisManifest(ManifestHash) {
  const ManifestPath = join(BasePath, ManifestHash);
  const ManifestBaseURL =
    OrchisAssetURL + "/manifests/universe/" + ManifestHash;
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.manifest",
    join(ManifestPath, "assetbundle.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.en_us.manifest",
    join(ManifestPath, "assetbundle.en_us.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.zh_cn.manifest",
    join(ManifestPath, "assetbundle.zh_cn.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.zh_tw.manifest",
    join(ManifestPath, "assetbundle.zh_tw.manifest")
  );
}
async function DownloadAsset(TargetURL, TargetPath) {
  while (ActiveDownloads >= 5) {
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  ActiveDownloads += 1;
  return new Promise((resolve, reject) => {
    console.log("Downloading " + TargetURL);
    get(TargetURL, (Response) => {
      let FinalData = "";
      const WriteOut = createWriteStream(TargetPath).on("finish", () => {
        ActiveDownloads -= 1;
        resolve({});
      });
      Response.pipe(WriteOut);
    }).on("error", (err) => {
      ActiveDownloads -= 1;
      console.error(`Error downloading asset ${TargetURL}:`, err);
      reject("Error: " + err.message);
    });
  });
}
async function OrchisHeartbeat() {
  while (true) {
    while (ActiveDownloads >= 5) {
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
    const VersionData = await OrchisAssetVer();
    if (!existsSync(join(BasePath, VersionData["iOS_Manifest"]))) {
      mkdirSync(join(BasePath, VersionData["iOS_Manifest"]));
      await DownloadOrchisManifest(VersionData["iOS_Manifest"]);
    }
    if (!existsSync(join(BasePath, VersionData["Android_Manifest"]))) {
      mkdirSync(join(BasePath, VersionData["Android_Manifest"]));
      await DownloadOrchisManifest(VersionData["Android_Manifest"]);
    }
    for (let entry in VersionData["iOS_FileList"]) {
      const FilePath = join(
        BasePath,
        VersionData["iOS_FileList"][entry].slice(0, 2),
        VersionData["iOS_FileList"][entry]
      );
      if (!existsSync(FilePath)) {
        if (
          !existsSync(
            join(BasePath, VersionData["iOS_FileList"][entry].slice(0, 2))
          )
        ) {
          mkdirSync(
            join(BasePath, VersionData["iOS_FileList"][entry].slice(0, 2))
          );
        }
        const AssetURL =
          OrchisAssetURL +
          "/assetbundles/iOS/" +
          VersionData["iOS_FileList"][entry].slice(0, 2) +
          "/" +
          VersionData["iOS_FileList"][entry];
        DownloadAsset(AssetURL, FilePath);
      }
    }
    for (let entry in VersionData["Android_FileList"]) {
      const FilePath = join(
        BasePath,
        VersionData["Android_FileList"][entry].slice(0, 2),
        VersionData["Android_FileList"][entry]
      );
      if (!existsSync(FilePath)) {
        if (
          !existsSync(
            join(BasePath, VersionData["Android_FileList"][entry].slice(0, 2))
          )
        ) {
          mkdirSync(
            join(BasePath, VersionData["Android_FileList"][entry].slice(0, 2))
          );
        }
        const AssetURL =
          OrchisAssetURL +
          "/assetbundles/Android/" +
          VersionData["Android_FileList"][entry].slice(0, 2) +
          "/" +
          VersionData["Android_FileList"][entry];
        DownloadAsset(AssetURL, FilePath);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 1800000));
  }
}

console.log("Fileserver started.");
if (!existsSync(join(BasePath, "b1HyoeTFegeTexC0"))) {
  const ManifestPath = join(BasePath, "b1HyoeTFegeTexC0");
  const ManifestBaseURL =
    OrchisAssetURL + "/manifests/universe/b1HyoeTFegeTexC0";
  mkdirSync(ManifestPath);
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.manifest",
    join(ManifestPath, "assetbundle.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.en_us.manifest",
    join(ManifestPath, "assetbundle.en_us.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.en_eu.manifest",
    join(ManifestPath, "assetbundle.en_eu.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.zh_cn.manifest",
    join(ManifestPath, "assetbundle.zh_cn.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.zh_tw.manifest",
    join(ManifestPath, "assetbundle.zh_tw.manifest")
  );
}
if (!existsSync(join(BasePath, "y2XM6giU6zz56wCm"))) {
  const ManifestPath = join(BasePath, "y2XM6giU6zz56wCm");
  const ManifestBaseURL =
    OrchisAssetURL + "/manifests/universe/y2XM6giU6zz56wCm";
  mkdirSync(ManifestPath);
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.manifest",
    join(ManifestPath, "assetbundle.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.en_us.manifest",
    join(ManifestPath, "assetbundle.en_us.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.en_eu.manifest",
    join(ManifestPath, "assetbundle.en_eu.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.zh_cn.manifest",
    join(ManifestPath, "assetbundle.zh_cn.manifest")
  );
  DownloadAsset(
    ManifestBaseURL + "/assetbundle.zh_tw.manifest",
    join(ManifestPath, "assetbundle.zh_tw.manifest")
  );
}
OrchisHeartbeat();
