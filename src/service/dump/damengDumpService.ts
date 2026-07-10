import { createDamengDumpProfile } from "./sqlScriptDumpProfile";
import { SqlScriptDumpService } from "./sqlScriptDumpService";

export class DamengDumpService extends SqlScriptDumpService {
    constructor() {
        super(createDamengDumpProfile());
    }
}
