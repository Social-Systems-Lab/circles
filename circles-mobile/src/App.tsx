import { useState } from "react";
import reactLogo from "./assets/react.svg";
import { invoke } from "@tauri-apps/api/core";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";

function App() {
    const [greetMsg, setGreetMsg] = useState("");
    const [name, setName] = useState("");

    async function greet() {
        // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
        setGreetMsg(await invoke("greet", { name }));
    }

    return (
        <div className="flex flex-col justify-center items-center w-screen">
            <div className="flex flex-col justify-center items-center w-[700px] gap-2">
                <div className="text-lg font-bold">Circles Authenticator</div>
                <div>Authenticate yourself</div>
                <form
                    className="row"
                    onSubmit={(e) => {
                        e.preventDefault();
                        greet();
                    }}
                >
                    <Input id="greet-input" onChange={(e) => setName(e.currentTarget.value)} placeholder="Enter a name..." />
                </form>
                <Button type="submit">Authenticate</Button>
                <p>{greetMsg}</p>
            </div>
        </div>
    );
}

export default App;
