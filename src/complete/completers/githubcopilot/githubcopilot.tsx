import React from "react";
import {Completer, Model, Prompt} from "../../complete";
import {parse_settings, Settings, SettingsUI as ProviderSettingsUI,} from "./provider_settings";
import {editor_plugin_version, editor_version, refresh_token_minutes, user_agent} from "./constants";
//import {parse_settings as parse_model_settings} from "./model_settings"; // TODO Implement my own model settings
import {requestUrl} from "obsidian";

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
			throw new Error("No API key provided");
		}

		const response = await requestUrl({
			url: 'https://api.github.com/copilot_internal/v2/token',
			method: 'GET',
			headers: {
				'authorization': `token ${api_key}`,
				'editor-version': editor_version,
				'editor-plugin-version': editor_plugin_version,
				'user-agent': user_agent
			}
		});
		this.token = (await response.json).token;
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
		if (this.token === null || this.token === undefined || this.token === "") {
			await this.get_token();
		}
		//const model_settings = parse_model_settings(settings);
		const model_settings = { // TODO Implement settings
			max_tokens: 100,
			temperature: 0
		};

		try {
			const response = await requestUrl({
				url: 'https://copilot-proxy.githubusercontent.com/v1/engines/copilot-codex/completions',
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.token}`,
					'Content-Type': 'application/json',
					user_agent: user_agent
				},
				body: JSON.stringify({
					prompt: prompt.prefix,
					suffix: prompt.suffix,
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

			if (response.status !== 200) {
				console.error(response);
				throw new Error(`HTTP error! Status: ${response.status}`);
			}

			if (response.text === null) {
				console.error(response)
				throw new Error('Response body is empty');
			}

			let result = '';

			for (const line of response.text.split('\n')) {
				if (line.startsWith('data: {')) {
					try {
						const jsonLine = JSON.parse(line.slice(6));
						const completion = jsonLine.choices[0]?.text || '\n';
						result += completion;
					} catch (error) {
						console.error('Error parsing JSON:', error);
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
