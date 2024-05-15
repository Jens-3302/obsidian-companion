import React from "react";
import {Completer, Model, Prompt} from "../../complete";
import {
	SettingsUI as ProviderSettingsUI,
	Settings,
	parse_settings,
} from "./provider_settings";
import {editor_version, editor_plugin_version, user_agent, refresh_token_minutes} from "./constants";
import {parse_settings as parse_model_settings} from "../chatgpt/model_settings"; // TODO Implement my own model settings

let running_token_thread = 0;

export default class CopilotModel implements Model {
	id: string;
	name: string;
	description: string;
	token: string;

	provider_settings: Settings;

	constructor(
		id: string,
		name: string,
		description: string,
		provider_settings: string
	) {
		this.id = id;
		this.name = name;
		this.description = description;
		this.provider_settings = parse_settings(provider_settings);
		this.token_thread();
	}

	async get_token() {
		const api_key = this.provider_settings.api_key;
		if (api_key === "") {
			return Promise.resolve("");
		}

		const resp = await fetch('https://api.github.com/copilot_internal/v2/token', {
			method: 'GET',
			headers: {
				'authorization': `token ${api_key}`,
				'editor-version': editor_version,
				'editor-plugin-version': editor_plugin_version,
				'user-agent': user_agent
			}
		});
		this.token = (await resp.json()).token;
	}

	// Runs forever
	async token_thread() {
		let this_thread = ++running_token_thread;
		while (this_thread === running_token_thread) { // to prevent multiple tokens from being generated
			await this.get_token();
			await new Promise(resolve => setTimeout(resolve, refresh_token_minutes * 60 * 1000));
		}
	}

	async complete(prompt: Prompt, settings: string): Promise<string> {
		if (this.token === null) {
			await this.get_token();
		}
		//const model_settings = parse_model_settings(settings);
		const model_settings = { // TODO Implement settings
			max_tokens: 100,
			temperature: 0
		};
		try {
			const response = await fetch('https://copilot-proxy.githubusercontent.com/v1/engines/copilot-codex/completions', {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					prompt: prompt,
					suffix: '',
					max_tokens: model_settings.max_tokens,
					temperature: model_settings.temperature,
					top_p: 1,
					n: 1,
					stop: ['\n'],
					nwo: 'github/copilot.vim',
					stream: true,
					extra: {
						language: 'markdown'
					}
				})
			});
			if (!response.body) {
				console.error('No response body');
				return '';
			}
			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let result = '';

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				const lines = chunk.split('\n');
				for (const line of lines) {
					if (line.startsWith('data: {')) {
						const jsonLine = JSON.parse(line.slice(6));
						const completion = jsonLine.choices[0].text;
						if (completion) {
							result += completion;
						} else {
							result += '\n';
						}
					}
				}
			}

			return result;
		} catch (error) {
			console.error('Error fetching completions:', error);
			return '';
		}
	}

}

export class CopilotComplete implements Completer {
id: string = "githubcopilot";
	name: string = "GitHub Copilot";
	description = (
		<>
			<a href="https://copilot.github.com">GitHub Copilot</a> - an AI pair programmer
			that helps you write code faster with less work. It also supports markdown.
		</>
	); // Copilot is blowing its own horn here xD

	async get_models(settings: string) {
		return [
			new CopilotModel(
				"githubcopilot",
				"GitHub Copilot",
				"GitHub Copilot model",
				settings)
		];
	}

	Settings = ProviderSettingsUI;
}
