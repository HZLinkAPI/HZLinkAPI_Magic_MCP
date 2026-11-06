import {homedir} from 'node:os';
import {join} from 'node:path';

const home=homedir();
export const dataDirectory=process.env.HZLINKAPI_MAGIC_DATA_DIR||join(home,'Library','Application Support','HZLinkAPI Magic','data');
export const outputDirectory=join(dataDirectory,'outputs');
export const referenceDirectory=join(dataDirectory,'references');
