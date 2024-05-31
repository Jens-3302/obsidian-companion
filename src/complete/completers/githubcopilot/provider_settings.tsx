import * as React from "react";
import SettingsItem from "../../../components/SettingsItem";
import {App, Modal, Notice, requestUrl} from "obsidian";
import {client_id, editor_plugin_version, editor_version, user_agent} from "./constants";

class AuthModal extends Modal {
	verificationUri: string;
	userCode: string;

	constructor(app: App, verificationUri: string, userCode: string) {
		super(app);
		this.verificationUri = verificationUri;
		this.userCode = userCode;
	}

	onOpen() {
		const { contentEl } = this;
		// Create a single paragraph element with mixed content
		const pElement = contentEl.createEl('p');
		pElement.append(
			'Please visit ',
			Object.assign(document.createElement('a'), {
				textContent: this.verificationUri,
				href: this.verificationUri,
				target: '_blank'
			}),
			' and enter the code ',
			Object.assign(document.createElement('code'), {
				textContent: this.userCode,
				id: 'user-code-display',
				style: 'cursor: pointer;', // Indicate it's clickable
				title: 'Click to copy'
			}),
			' to authenticate.'
		);

		const doneButton = contentEl.createEl('button', { text: 'Done' });
		doneButton.addEventListener('click', () => this.close());
		doneButton.style.marginTop = '10px';
		doneButton.style.float = 'right';

		// Add a click event to copy the userCode to clipboard
		const codeElement = document.getElementById('user-code-display');
		codeElement!.addEventListener('click', () =>
			navigator.clipboard.writeText(this.userCode));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

async function getAPIkey() { // From reference

	const resp = await requestUrl({
		url:'https://github.com/login/device/code',
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

	const { device_code, user_code, verification_uri } = await resp.json;

	//console.log(`Please visit ${verification_uri} and enter code ${user_code} to authenticate.`)
	// Use an Obsidian modal to show the verification URI and user code
	new AuthModal(this.app, verification_uri, user_code).open();

	let access_token;
	const startTime = Date.now();
	const duration = 10 * 60 * 1000; // 10 minutes in milliseconds

	while (Date.now() - startTime < duration) {
		await new Promise(resolve => setTimeout(resolve, 5000));
		// Every 5 secs, see if we are logged in
		const response = await requestUrl({
			url:'https://github.com/login/oauth/access_token',
			method:'POST',
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

		access_token = (await response.json).access_token;
		if (access_token) {
			return access_token;
		}
	}
	// Give feedback that no token was received
	new Notice('No Copilot token received for 10 minutes.');
	throw new Error('No Copilot token received for 10 minutes.');
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
				name="Copilot Login"
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
				name="Copilot Logout"
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

			<SettingsItem
				name="API Key"
				description={
					<>
						API Key for Github Copilot.
					</>
				}
			>
				<input
					type="text"
					value={parse_settings(settings).api_key}
					onChange={(e) => {
						saveSettings(JSON.stringify({api_key: e.target.value}))
						if (e.target.value == "") {
							document.getElementById("copilot-login-button")!.removeAttribute("disabled");
							document.getElementById("copilot-logout-button")!.setAttribute("disabled", "true");
						} else {
							document.getElementById("copilot-login-button")!.setAttribute("disabled", "true");
							document.getElementById("copilot-logout-button")!.removeAttribute("disabled");
						}
					}}
				/>
			</SettingsItem>
		</>
	);
}
