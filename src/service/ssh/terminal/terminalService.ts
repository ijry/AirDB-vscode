import { Hanlder } from "@/common/viewManager";
import { SSHConfig } from "@/model/interface/sshConfig";

export interface TerminalService {
    openPath(sshConfig: SSHConfig, fullPath: string): void;
    openMethod(sshConfig: SSHConfig): Promise<Hanlder>;
}