// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { Badge, Button, Input, Loader, Switch, useKumoToastManager } from "@cloudflare/kumo";
import { RobotIcon, ArrowCounterClockwiseIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

const DEFAULT_MODEL_VALUE = "@cf/moonshotai/kimi-k2.5";
const CUSTOM_MODEL_SENTINEL = "__custom__";

const MODEL_OPTIONS = [
	{ label: "Default (Kimi K2.5)", value: DEFAULT_MODEL_VALUE },
	{ label: "Llama 3.3 70B Fast", value: "@cf/meta/llama-3.3-70b-instruct-fp8-fast" },
	{ label: "Llama 3.1 8B Fast", value: "@cf/meta/llama-3.1-8b-instruct-fast" },
	{ label: "Qwen 2.5 Coder 32B", value: "@cf/qwen/qwen2.5-coder-32b-instruct" },
	{ label: "Gemma 3 12B", value: "@cf/google/gemma-3-12b-it" },
	{ label: "Mistral Small 3.1 24B", value: "@cf/mistralai/mistral-small-3.1-24b-instruct" },
	{ label: "Custom…", value: CUSTOM_MODEL_SENTINEL },
] as const;

function modelToSelectValue(model: string | undefined): string {
	if (!model) return DEFAULT_MODEL_VALUE;
	const preset = MODEL_OPTIONS.find((o) => o.value === model && o.value !== CUSTOM_MODEL_SENTINEL);
	return preset ? preset.value : CUSTOM_MODEL_SENTINEL;
}

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [autoDraftEnabled, setAutoDraftEnabled] = useState(true);
	const [selectedModelValue, setSelectedModelValue] = useState(DEFAULT_MODEL_VALUE);
	const [customModel, setCustomModel] = useState("");
	const [resendEnabled, setResendEnabled] = useState(true);
	const [fromAddress, setFromAddress] = useState("");
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
			setAutoDraftEnabled(mailbox.settings?.autoDraft?.enabled !== false);
			setResendEnabled(mailbox.settings?.resendEnabled !== false);
			setFromAddress(mailbox.settings?.fromAddress || "");

			const savedModel = mailbox.settings?.agentModel as string | undefined;
			const selectVal = modelToSelectValue(savedModel);
			setSelectedModelValue(selectVal);
			if (selectVal === CUSTOM_MODEL_SENTINEL) {
				setCustomModel(savedModel || "");
			} else {
				setCustomModel("");
			}
		}
	}, [mailbox]);

	const trimmedFromAddress = fromAddress.trim();
	const isFromAddressValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedFromAddress);
	const fromAddressError = resendEnabled && !isFromAddressValid
		? "Enter the verified Resend sending address (e.g. hello@homeyfy.com)."
		: null;

	const isCustomModel = selectedModelValue === CUSTOM_MODEL_SENTINEL;

	const effectiveModel = (): string | undefined => {
		if (selectedModelValue === DEFAULT_MODEL_VALUE) return undefined;
		if (isCustomModel) return customModel.trim() || undefined;
		return selectedModelValue;
	};

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		if (fromAddressError) {
			toastManager.add({ title: fromAddressError, variant: "error" });
			return;
		}
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
			autoDraft: { enabled: autoDraftEnabled },
			agentModel: effectiveModel(),
			resendEnabled,
			fromAddress: resendEnabled ? trimmedFromAddress : undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Auto-draft */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between gap-4">
						<div>
							<div className="text-sm font-medium text-kumo-default">
								Auto-draft replies on incoming email
							</div>
							<p className="text-xs text-kumo-subtle mt-0.5">
								When enabled, the AI agent automatically drafts a reply for each new inbound email.
							</p>
						</div>
						<Switch
							checked={autoDraftEnabled}
							onCheckedChange={setAutoDraftEnabled}
							aria-label="Auto-draft replies on incoming email"
						/>
					</div>
				</div>

				{/* Outbound sending (Resend) */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between gap-4">
						<div>
							<div className="text-sm font-medium text-kumo-default">
								Enable outbound sending via Resend
							</div>
							<p className="text-xs text-kumo-subtle mt-0.5">
								When disabled, send/reply/forward from this mailbox will be blocked.
							</p>
						</div>
						<Switch
							checked={resendEnabled}
							onCheckedChange={setResendEnabled}
							aria-label="Enable outbound sending via Resend"
						/>
					</div>
					{resendEnabled && (
						<div className="mt-4 space-y-1">
							<Input
								label="Sending address"
								type="email"
								value={fromAddress}
								onChange={(e) => setFromAddress(e.target.value)}
								placeholder="hello@homeyfy.com"
								required
							/>
							<p className="text-xs text-kumo-subtle">
								Outgoing mail from this mailbox will be sent as this address. The domain must be verified in your Resend account.
							</p>
							{fromAddressError && (
								<p className="text-xs text-kumo-danger">{fromAddressError}</p>
							)}
						</div>
					)}
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>

				{/* Agent Model */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center gap-2 mb-4">
						<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
						<span className="text-sm font-medium text-kumo-default">
							AI Agent Model
						</span>
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Choose the Workers AI model used by the agent for this mailbox.
						Select "Default" to follow the built-in default (Kimi K2.5).
					</p>
					<select
						value={selectedModelValue}
						onChange={(e) => {
							setSelectedModelValue(e.target.value);
							if (e.target.value !== CUSTOM_MODEL_SENTINEL) setCustomModel("");
						}}
						className="w-full rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-1.5 text-xs text-kumo-default focus:outline-none focus:ring-1 focus:ring-kumo-ring"
					>
						{MODEL_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
					{isCustomModel && (
						<input
							type="text"
							value={customModel}
							onChange={(e) => setCustomModel(e.target.value)}
							placeholder="@cf/provider/model-name"
							className="mt-2 w-full rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-1.5 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono"
						/>
					)}
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
