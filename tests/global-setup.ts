// Serve the fixture as docs/data.json for the run; put the real file back afterwards.
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const LIVE = path.join(ROOT, 'docs', 'data.json');
const BACKUP = path.join(ROOT, 'docs', 'data.json.bak');
const FIXTURE = path.join(ROOT, 'scripts', 'sample-data.json');

export default async function globalSetup() {
  // A backup left behind by an interrupted run is the real file; restore it before taking a new backup.
  if (fs.existsSync(BACKUP)) fs.copyFileSync(BACKUP, LIVE);
  if (fs.existsSync(LIVE)) fs.copyFileSync(LIVE, BACKUP);
  fs.copyFileSync(FIXTURE, LIVE);
  return () => {
    if (fs.existsSync(BACKUP)) {
      fs.copyFileSync(BACKUP, LIVE);
      fs.unlinkSync(BACKUP);
    } else {
      fs.unlinkSync(LIVE);
    }
  };
}
