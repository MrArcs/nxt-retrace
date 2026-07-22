import os from "node:os"
import path from "node:path"

/** all pwrec data (sqlite db + run artifacts) lives here */
export const DATA_DIR =
  process.env.PWREC_DATA_DIR ?? path.join(os.homedir(), ".pwrec")
export const DB_PATH = path.join(DATA_DIR, "data.db")
export const RUNS_DIR = path.join(DATA_DIR, "runs")
export const BUGS_DIR = path.join(DATA_DIR, "bugs")
