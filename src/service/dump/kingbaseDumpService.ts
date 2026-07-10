import { createKingbaseDumpProfile } from "./sqlScriptDumpProfile";
import { SqlScriptDumpService } from "./sqlScriptDumpService";

export class KingbaseDumpService extends SqlScriptDumpService {
    constructor() {
        super(createKingbaseDumpProfile());
    }
}
