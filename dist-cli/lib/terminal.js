import readline from "node:readline";
import { stdout } from "node:process";
export async function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: stdout,
    });
    const answer = await new Promise((resolve) => {
        rl.question(question, resolve);
    });
    rl.close();
    return answer.trim();
}
