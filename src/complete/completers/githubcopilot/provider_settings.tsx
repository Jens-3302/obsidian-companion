import * as React from "react";
import SettingsItem from "../../../components/SettingsItem";
import {App, Modal} from "obsidian";
import {editor_version, editor_plugin_version, user_agent, client_id} from "./constants";

class AuthModal extends Modal { // Generated
	verificationUri: string;
	userCode: string;

	constructor(app: App, verificationUri: string, userCode: string) {
		super(app);
		this.verificationUri = verificationUri;
		this.userCode = userCode;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'GitHub Authentication' });
		contentEl.createEl('p', { text: `Please visit ${this.verificationUri} and enter the code \`${this.userCode}\` to authenticate.` });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

async function getAPIkey() { // From reference

	const resp = await fetch('https://github.com/login/device/code', {
		method: 'POST',
		headers: {
			'accept': 'application/json',
			'editor-version': editor_version,
			'editor-plugin-version': editor_plugin_version,
			'content-type': 'application/json',
			'user-agent': user_agent,
			'accept-encoding': 'gzip,deflate,br'
		},
		body: JSON.stringify({
			client_id: client_id,
			scope: 'read:user'
		})
	});

	const { device_code, user_code, verification_uri } = await resp.json();

	//console.log(`Please visit ${verification_uri} and enter code ${user_code} to authenticate.`)
	// Use an Obsidian modal to show the verification URI and user code
	new AuthModal(this.app, verification_uri, user_code).open();

	let access_token;
	while (true) {
		await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds

		// TODO Replace fetch with some node feature to avoid CORS
		const response = await fetch('https://github.com/login/oauth/access_token', {
			method: 'POST',
			headers: {
				'accept': 'application/json',
				'editor-version': editor_version,
				'editor-plugin-version': editor_plugin_version,
				'content-type': 'application/json',
				'user-agent': user_agent,
				'accept-encoding': 'gzip,deflate,br'
			},
			body: JSON.stringify({
				client_id: client_id,
				device_code,
				grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
			})
		});

		access_token = (await response.json()).access_token;
		if (access_token) {
			return access_token;
		}
	}
}


export interface Settings {
	api_key: string;
}

export const parse_settings = (data: string | null): Settings => {
	if (data === null) {
		return { api_key: "" };
	}
	try {
		const settings = JSON.parse(data);
		if (typeof settings.api_key !== "string") {
			return { api_key: "" };
		}
		return settings;
	} catch (e) {
		return { api_key: "" };
	}
}

export function SettingsUI({
   settings,
   saveSettings,
}: {
	settings: string | null;
	saveSettings: (settings: string) => void;
}) {
	return (
		<>
			<SettingsItem
				name="CopilotLogin"
				description={
					<>
						Get a Github Copilot API key.
					</>
				}
			>
				<button
					id="copilot-login-button"
					disabled={parse_settings(settings).api_key!=""}
					onClick={() => {
						// disable this
						document.getElementById("copilot-login-button")!.setAttribute("disabled", "true");
						getAPIkey().then((api_key) => {
							saveSettings(
								JSON.stringify({api_key: api_key})
							)
							// Enable Logout
							document.getElementById("copilot-logout-button")!.removeAttribute("disabled");
						}).catch((e) => {
							console.error(e);
							// Enable Login
							document.getElementById("copilot-login-button")!.removeAttribute("disabled");
						})
				}}>Login</button>
			</SettingsItem>
			<SettingsItem
				name="CopilotLogout"
				description={
					<>
						Remove current Github Copilot API key.
					</>
				}
			>
				<button
					id="copilot-logout-button"
					disabled={parse_settings(settings).api_key==""}
					onClick={() => {
						saveSettings(
							JSON.stringify({api_key: ""})
						)
						// Disable this and enable Login
						document.getElementById("copilot-logout-button")!.setAttribute("disabled", "true");
						document.getElementById("copilot-login-button")!.removeAttribute("disabled");
				}}>Logout</button>
			</SettingsItem>
		</>
	);
}
