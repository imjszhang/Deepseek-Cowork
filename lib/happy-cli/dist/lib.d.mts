import * as z from 'zod';
import { z as z$1 } from 'zod';
import { EventEmitter } from 'node:events';
import { Socket } from 'socket.io-client';
import { SessionTurnEndStatus, SessionEnvelope } from '@slopus/happy-wire';
import { ExpoPushMessage } from 'expo-server-sdk';

/**
 * Simplified schema that only validates fields actually used in the codebase
 * while preserving all other fields through passthrough()
 */

declare const UsageSchema: z$1.ZodObject<{
    input_tokens: z$1.ZodNumber;
    cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
    cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
    output_tokens: z$1.ZodNumber;
    service_tier: z$1.ZodOptional<z$1.ZodString>;
}, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
    input_tokens: z$1.ZodNumber;
    cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
    cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
    output_tokens: z$1.ZodNumber;
    service_tier: z$1.ZodOptional<z$1.ZodString>;
}, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
    input_tokens: z$1.ZodNumber;
    cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
    cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
    output_tokens: z$1.ZodNumber;
    service_tier: z$1.ZodOptional<z$1.ZodString>;
}, z$1.ZodTypeAny, "passthrough">>;
declare const RawJSONLinesSchema: z$1.ZodDiscriminatedUnion<"type", [z$1.ZodObject<{
    type: z$1.ZodLiteral<"user">;
    isSidechain: z$1.ZodOptional<z$1.ZodBoolean>;
    isMeta: z$1.ZodOptional<z$1.ZodBoolean>;
    uuid: z$1.ZodString;
    message: z$1.ZodObject<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, z$1.ZodTypeAny, "passthrough">>;
}, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
    type: z$1.ZodLiteral<"user">;
    isSidechain: z$1.ZodOptional<z$1.ZodBoolean>;
    isMeta: z$1.ZodOptional<z$1.ZodBoolean>;
    uuid: z$1.ZodString;
    message: z$1.ZodObject<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, z$1.ZodTypeAny, "passthrough">>;
}, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
    type: z$1.ZodLiteral<"user">;
    isSidechain: z$1.ZodOptional<z$1.ZodBoolean>;
    isMeta: z$1.ZodOptional<z$1.ZodBoolean>;
    uuid: z$1.ZodString;
    message: z$1.ZodObject<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
        content: z$1.ZodUnion<[z$1.ZodString, z$1.ZodAny]>;
    }, z$1.ZodTypeAny, "passthrough">>;
}, z$1.ZodTypeAny, "passthrough">>, z$1.ZodObject<{
    uuid: z$1.ZodString;
    type: z$1.ZodLiteral<"assistant">;
    message: z$1.ZodOptional<z$1.ZodObject<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, z$1.ZodTypeAny, "passthrough">>>;
}, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
    uuid: z$1.ZodString;
    type: z$1.ZodLiteral<"assistant">;
    message: z$1.ZodOptional<z$1.ZodObject<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, z$1.ZodTypeAny, "passthrough">>>;
}, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
    uuid: z$1.ZodString;
    type: z$1.ZodLiteral<"assistant">;
    message: z$1.ZodOptional<z$1.ZodObject<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
        usage: z$1.ZodOptional<z$1.ZodObject<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
            input_tokens: z$1.ZodNumber;
            cache_creation_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            cache_read_input_tokens: z$1.ZodOptional<z$1.ZodNumber>;
            output_tokens: z$1.ZodNumber;
            service_tier: z$1.ZodOptional<z$1.ZodString>;
        }, z$1.ZodTypeAny, "passthrough">>>;
        model: z$1.ZodOptional<z$1.ZodString>;
    }, z$1.ZodTypeAny, "passthrough">>>;
}, z$1.ZodTypeAny, "passthrough">>, z$1.ZodObject<{
    type: z$1.ZodLiteral<"summary">;
    summary: z$1.ZodString;
    leafUuid: z$1.ZodString;
}, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
    type: z$1.ZodLiteral<"summary">;
    summary: z$1.ZodString;
    leafUuid: z$1.ZodString;
}, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
    type: z$1.ZodLiteral<"summary">;
    summary: z$1.ZodString;
    leafUuid: z$1.ZodString;
}, z$1.ZodTypeAny, "passthrough">>, z$1.ZodObject<{
    type: z$1.ZodLiteral<"system">;
    uuid: z$1.ZodString;
}, "passthrough", z$1.ZodTypeAny, z$1.objectOutputType<{
    type: z$1.ZodLiteral<"system">;
    uuid: z$1.ZodString;
}, z$1.ZodTypeAny, "passthrough">, z$1.objectInputType<{
    type: z$1.ZodLiteral<"system">;
    uuid: z$1.ZodString;
}, z$1.ZodTypeAny, "passthrough">>]>;
type RawJSONLines = z$1.infer<typeof RawJSONLinesSchema>;

/**
 * Minimal persistence functions for happy CLI
 *
 * Handles settings and private key storage in ~/.happy/ or local .happy/
 */

declare const SandboxConfigSchema: z.ZodObject<{
    enabled: z.ZodDefault<z.ZodBoolean>;
    workspaceRoot: z.ZodOptional<z.ZodString>;
    sessionIsolation: z.ZodDefault<z.ZodEnum<["strict", "workspace", "custom"]>>;
    customWritePaths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    denyReadPaths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    extraWritePaths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    denyWritePaths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    networkMode: z.ZodDefault<z.ZodEnum<["blocked", "allowed", "custom"]>>;
    allowedDomains: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    deniedDomains: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    allowLocalBinding: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
    sessionIsolation: "custom" | "strict" | "workspace";
    customWritePaths: string[];
    denyReadPaths: string[];
    extraWritePaths: string[];
    denyWritePaths: string[];
    networkMode: "custom" | "blocked" | "allowed";
    allowedDomains: string[];
    deniedDomains: string[];
    allowLocalBinding: boolean;
    workspaceRoot?: string | undefined;
}, {
    enabled?: boolean | undefined;
    workspaceRoot?: string | undefined;
    sessionIsolation?: "custom" | "strict" | "workspace" | undefined;
    customWritePaths?: string[] | undefined;
    denyReadPaths?: string[] | undefined;
    extraWritePaths?: string[] | undefined;
    denyWritePaths?: string[] | undefined;
    networkMode?: "custom" | "blocked" | "allowed" | undefined;
    allowedDomains?: string[] | undefined;
    deniedDomains?: string[] | undefined;
    allowLocalBinding?: boolean | undefined;
}>;
type SandboxConfig = z.infer<typeof SandboxConfigSchema>;
type Credentials = {
    token: string;
    encryption: {
        type: 'legacy';
        secret: Uint8Array;
    } | {
        type: 'dataKey';
        publicKey: Uint8Array;
        machineKey: Uint8Array;
    };
};

/**
 * Permission mode type - includes both Claude and Codex modes
 * Must match MessageMetaSchema.permissionMode enum values
 *
 * Claude modes: default, acceptEdits, bypassPermissions, plan
 * Codex modes: read-only, safe-yolo, yolo
 *
 * When calling Claude SDK, Codex modes are mapped at the SDK boundary:
 * - yolo → bypassPermissions
 * - safe-yolo → default
 * - read-only → default
 */
type PermissionMode = 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan' | 'read-only' | 'safe-yolo' | 'yolo';
/**
 * Usage data type from Claude
 */
type Usage = z$1.infer<typeof UsageSchema>;
/**
 * Session information
 */
type Session = {
    id: string;
    seq: number;
    encryptionKey: Uint8Array;
    encryptionVariant: 'legacy' | 'dataKey';
    metadata: Metadata;
    metadataVersion: number;
    agentState: AgentState | null;
    agentStateVersion: number;
};
/**
 * Machine metadata - static information (rarely changes)
 */
declare const MachineMetadataSchema: z$1.ZodObject<{
    host: z$1.ZodString;
    platform: z$1.ZodString;
    happyCliVersion: z$1.ZodString;
    homeDir: z$1.ZodString;
    happyHomeDir: z$1.ZodString;
    happyLibDir: z$1.ZodString;
    cliAvailability: z$1.ZodOptional<z$1.ZodObject<{
        claude: z$1.ZodBoolean;
        codex: z$1.ZodBoolean;
        gemini: z$1.ZodBoolean;
        openclaw: z$1.ZodBoolean;
        detectedAt: z$1.ZodNumber;
    }, "strip", z$1.ZodTypeAny, {
        claude: boolean;
        codex: boolean;
        gemini: boolean;
        openclaw: boolean;
        detectedAt: number;
    }, {
        claude: boolean;
        codex: boolean;
        gemini: boolean;
        openclaw: boolean;
        detectedAt: number;
    }>>;
    resumeSupport: z$1.ZodOptional<z$1.ZodObject<{
        rpcAvailable: z$1.ZodBoolean;
        requiresSameMachine: z$1.ZodBoolean;
        requiresHappyAgentAuth: z$1.ZodBoolean;
        happyAgentAuthenticated: z$1.ZodBoolean;
        detectedAt: z$1.ZodNumber;
    }, "strip", z$1.ZodTypeAny, {
        detectedAt: number;
        rpcAvailable: boolean;
        requiresSameMachine: boolean;
        requiresHappyAgentAuth: boolean;
        happyAgentAuthenticated: boolean;
    }, {
        detectedAt: number;
        rpcAvailable: boolean;
        requiresSameMachine: boolean;
        requiresHappyAgentAuth: boolean;
        happyAgentAuthenticated: boolean;
    }>>;
}, "strip", z$1.ZodTypeAny, {
    host: string;
    platform: string;
    happyCliVersion: string;
    homeDir: string;
    happyHomeDir: string;
    happyLibDir: string;
    cliAvailability?: {
        claude: boolean;
        codex: boolean;
        gemini: boolean;
        openclaw: boolean;
        detectedAt: number;
    } | undefined;
    resumeSupport?: {
        detectedAt: number;
        rpcAvailable: boolean;
        requiresSameMachine: boolean;
        requiresHappyAgentAuth: boolean;
        happyAgentAuthenticated: boolean;
    } | undefined;
}, {
    host: string;
    platform: string;
    happyCliVersion: string;
    homeDir: string;
    happyHomeDir: string;
    happyLibDir: string;
    cliAvailability?: {
        claude: boolean;
        codex: boolean;
        gemini: boolean;
        openclaw: boolean;
        detectedAt: number;
    } | undefined;
    resumeSupport?: {
        detectedAt: number;
        rpcAvailable: boolean;
        requiresSameMachine: boolean;
        requiresHappyAgentAuth: boolean;
        happyAgentAuthenticated: boolean;
    } | undefined;
}>;
type MachineMetadata = z$1.infer<typeof MachineMetadataSchema>;
/**
 * Daemon state - dynamic runtime information (frequently updated)
 */
declare const DaemonStateSchema: z$1.ZodObject<{
    status: z$1.ZodUnion<[z$1.ZodEnum<["running", "shutting-down"]>, z$1.ZodString]>;
    pid: z$1.ZodOptional<z$1.ZodNumber>;
    httpPort: z$1.ZodOptional<z$1.ZodNumber>;
    startedAt: z$1.ZodOptional<z$1.ZodNumber>;
    shutdownRequestedAt: z$1.ZodOptional<z$1.ZodNumber>;
    shutdownSource: z$1.ZodOptional<z$1.ZodUnion<[z$1.ZodEnum<["mobile-app", "cli", "os-signal", "unknown"]>, z$1.ZodString]>>;
}, "strip", z$1.ZodTypeAny, {
    status: string;
    pid?: number | undefined;
    httpPort?: number | undefined;
    startedAt?: number | undefined;
    shutdownRequestedAt?: number | undefined;
    shutdownSource?: string | undefined;
}, {
    status: string;
    pid?: number | undefined;
    httpPort?: number | undefined;
    startedAt?: number | undefined;
    shutdownRequestedAt?: number | undefined;
    shutdownSource?: string | undefined;
}>;
type DaemonState = z$1.infer<typeof DaemonStateSchema>;
type Machine = {
    id: string;
    encryptionKey: Uint8Array;
    encryptionVariant: 'legacy' | 'dataKey';
    metadata: MachineMetadata;
    metadataVersion: number;
    daemonState: DaemonState | null;
    daemonStateVersion: number;
};
declare const UserMessageSchema: z$1.ZodObject<{
    role: z$1.ZodLiteral<"user">;
    content: z$1.ZodObject<{
        type: z$1.ZodLiteral<"text">;
        text: z$1.ZodString;
    }, "strip", z$1.ZodTypeAny, {
        type: "text";
        text: string;
    }, {
        type: "text";
        text: string;
    }>;
    localKey: z$1.ZodOptional<z$1.ZodString>;
    meta: z$1.ZodOptional<z$1.ZodObject<{
        sentFrom: z$1.ZodOptional<z$1.ZodString>;
        permissionMode: z$1.ZodOptional<z$1.ZodEnum<["default", "acceptEdits", "bypassPermissions", "plan", "read-only", "safe-yolo", "yolo"]>>;
        model: z$1.ZodOptional<z$1.ZodNullable<z$1.ZodString>>;
        fallbackModel: z$1.ZodOptional<z$1.ZodNullable<z$1.ZodString>>;
        customSystemPrompt: z$1.ZodOptional<z$1.ZodNullable<z$1.ZodString>>;
        appendSystemPrompt: z$1.ZodOptional<z$1.ZodNullable<z$1.ZodString>>;
        allowedTools: z$1.ZodOptional<z$1.ZodNullable<z$1.ZodArray<z$1.ZodString, "many">>>;
        disallowedTools: z$1.ZodOptional<z$1.ZodNullable<z$1.ZodArray<z$1.ZodString, "many">>>;
    }, "strip", z$1.ZodTypeAny, {
        model?: string | null | undefined;
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
    }, {
        model?: string | null | undefined;
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
    }>>;
}, "strip", z$1.ZodTypeAny, {
    content: {
        type: "text";
        text: string;
    };
    role: "user";
    localKey?: string | undefined;
    meta?: {
        model?: string | null | undefined;
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
    } | undefined;
}, {
    content: {
        type: "text";
        text: string;
    };
    role: "user";
    localKey?: string | undefined;
    meta?: {
        model?: string | null | undefined;
        sentFrom?: string | undefined;
        permissionMode?: "default" | "acceptEdits" | "bypassPermissions" | "plan" | "read-only" | "safe-yolo" | "yolo" | undefined;
        fallbackModel?: string | null | undefined;
        customSystemPrompt?: string | null | undefined;
        appendSystemPrompt?: string | null | undefined;
        allowedTools?: string[] | null | undefined;
        disallowedTools?: string[] | null | undefined;
    } | undefined;
}>;
type UserMessage = z$1.infer<typeof UserMessageSchema>;
type Metadata = {
    /**
     * ACP session config option value (normalized for UI metadata consumers).
     */
    models?: Array<{
        code: string;
        value: string;
        description?: string | null;
    }>;
    currentModelCode?: string;
    operatingModes?: Array<{
        code: string;
        value: string;
        description?: string | null;
    }>;
    currentOperatingModeCode?: string;
    thoughtLevels?: Array<{
        code: string;
        value: string;
        description?: string | null;
    }>;
    currentThoughtLevelCode?: string;
    path: string;
    host: string;
    version?: string;
    name?: string;
    os?: string;
    summary?: {
        text: string;
        updatedAt: number;
    };
    machineId?: string;
    claudeSessionId?: string;
    codexThreadId?: string;
    tools?: string[];
    slashCommands?: string[];
    mcpServers?: Array<{
        name: string;
        status: string;
    }>;
    skills?: string[];
    homeDir: string;
    happyHomeDir: string;
    happyLibDir: string;
    happyToolsDir: string;
    startedFromDaemon?: boolean;
    hostPid?: number;
    startedBy?: 'daemon' | 'terminal';
    lifecycleState?: 'running' | 'archiveRequested' | 'archived' | string;
    lifecycleStateSince?: number;
    archivedBy?: string;
    archiveReason?: string;
    flavor?: string;
    sandbox?: SandboxConfig | null;
    dangerouslySkipPermissions?: boolean | null;
};
type AgentState = {
    controlledByUser?: boolean | null | undefined;
    requests?: {
        [id: string]: {
            tool: string;
            arguments: any;
            createdAt: number;
        };
    };
    completedRequests?: {
        [id: string]: {
            tool: string;
            arguments: any;
            createdAt: number;
            completedAt: number;
            status: 'canceled' | 'denied' | 'approved';
            reason?: string;
            mode?: PermissionMode;
            decision?: 'approved' | 'approved_for_session' | 'denied' | 'abort';
            allowTools?: string[];
        };
    };
};

/**
 * Common RPC types and interfaces for both session and machine clients
 */
/**
 * Generic RPC handler function type
 * @template TRequest - The request data type
 * @template TResponse - The response data type
 */
type RpcHandler<TRequest = any, TResponse = any> = (data: TRequest) => TResponse | Promise<TResponse>;
/**
 * RPC request data from server
 */
interface RpcRequest {
    method: string;
    params: string;
}
/**
 * Configuration for RPC handler manager
 */
interface RpcHandlerConfig {
    scopePrefix: string;
    encryptionKey: Uint8Array;
    encryptionVariant: 'legacy' | 'dataKey';
    logger?: (message: string, data?: any) => void;
}

/**
 * Generic RPC handler manager for session and machine clients
 * Manages RPC method registration, encryption/decryption, and handler execution
 */

declare class RpcHandlerManager {
    private handlers;
    private readonly scopePrefix;
    private readonly encryptionKey;
    private readonly encryptionVariant;
    private readonly logger;
    private socket;
    constructor(config: RpcHandlerConfig);
    /**
     * Register an RPC handler for a specific method
     * @param method - The method name (without prefix)
     * @param handler - The handler function
     */
    registerHandler<TRequest = any, TResponse = any>(method: string, handler: RpcHandler<TRequest, TResponse>): void;
    unregisterHandler(method: string): void;
    /**
     * Handle an incoming RPC request
     * @param request - The RPC request data
     * @param callback - The response callback
     */
    handleRequest(request: RpcRequest): Promise<any>;
    onSocketConnect(socket: Socket): void;
    onSocketDisconnect(): void;
    /**
     * Get the number of registered handlers
     */
    getHandlerCount(): number;
    /**
     * Check if a handler is registered
     * @param method - The method name (without prefix)
     */
    hasHandler(method: string): boolean;
    /**
     * Clear all handlers
     */
    clearHandlers(): void;
    /**
     * Get the prefixed method name
     * @param method - The method name
     */
    private getPrefixedMethod;
}

/**
 * ACP (Agent Communication Protocol) message data types.
 * This is the unified format for all agent messages - CLI adapts each provider's format to ACP.
 */
type ACPMessageData = {
    type: 'message';
    message: string;
} | {
    type: 'reasoning';
    message: string;
} | {
    type: 'thinking';
    text: string;
} | {
    type: 'tool-call';
    callId: string;
    name: string;
    input: unknown;
    id: string;
} | {
    type: 'tool-result';
    callId: string;
    output: unknown;
    id: string;
    isError?: boolean;
} | {
    type: 'file-edit';
    description: string;
    filePath: string;
    diff?: string;
    oldContent?: string;
    newContent?: string;
    id: string;
} | {
    type: 'terminal-output';
    data: string;
    callId: string;
} | {
    type: 'task_started';
    id: string;
} | {
    type: 'task_complete';
    id: string;
} | {
    type: 'turn_aborted';
    id: string;
} | {
    type: 'permission-request';
    permissionId: string;
    toolName: string;
    description: string;
    options?: unknown;
} | {
    type: 'token_count';
    [key: string]: unknown;
};
declare class ApiSessionClient extends EventEmitter {
    private readonly token;
    readonly sessionId: string;
    private metadata;
    private metadataVersion;
    private agentState;
    private agentStateVersion;
    private socket;
    private pendingMessages;
    private pendingMessageCallback;
    readonly rpcHandlerManager: RpcHandlerManager;
    private agentStateLock;
    private metadataLock;
    private encryptionKey;
    private encryptionVariant;
    private reconnectInterval;
    private ignoreArchiveSignal;
    private skipInitialMessages;
    private claudeSessionProtocolState;
    private lastSeq;
    private pendingOutbox;
    private readonly sendSync;
    private readonly receiveSync;
    constructor(token: string, session: Session);
    onUserMessage(callback: (data: UserMessage) => void): void;
    private authHeaders;
    private routeIncomingMessage;
    private fetchMessages;
    private static readonly MAX_OUTBOX_BATCH_SIZE;
    private flushOutbox;
    private enqueueMessage;
    /**
     * Send message to session
     * @param body - Message body (can be MessageContent or raw content for agent messages)
     */
    sendClaudeSessionMessage(body: RawJSONLines): void;
    closeClaudeSessionTurn(status?: SessionTurnEndStatus): void;
    sendCodexMessage(body: any): void;
    private enqueueSessionProtocolEnvelope;
    sendSessionProtocolMessage(envelope: SessionEnvelope): void;
    /**
     * Send a generic agent message to the session using ACP (Agent Communication Protocol) format.
     * Works for any agent type (Gemini, Codex, Claude, etc.) - CLI normalizes to unified ACP format.
     *
     * @param provider - The agent provider sending the message (e.g., 'gemini', 'codex', 'claude')
     * @param body - The message payload (type: 'message' | 'reasoning' | 'tool-call' | 'tool-result')
     */
    sendAgentMessage(provider: 'gemini' | 'codex' | 'claude' | 'opencode' | 'openclaw', body: ACPMessageData): void;
    sendSessionEvent(event: {
        type: 'switch';
        mode: 'local' | 'remote';
    } | {
        type: 'message';
        message: string;
    } | {
        type: 'permission-mode-changed';
        mode: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
    } | {
        type: 'ready';
    }, id?: string): void;
    /**
     * Send a ping message to keep the connection alive
     */
    keepAlive(thinking: boolean, mode: 'local' | 'remote'): void;
    /**
     * Send session death message
     */
    sendSessionDeath(): void;
    /**
     * Send usage data to the server
     */
    sendUsageData(usage: Usage, model?: string): void;
    /**
     * Returns the latest session metadata known to the client.
     */
    getMetadata(): Metadata | null;
    /**
     * Update session metadata
     * @param handler - Handler function that returns the updated metadata
     */
    suppressNextArchiveSignal(): void;
    skipExistingMessages(): void;
    updateMetadata(handler: (metadata: Metadata) => Metadata): void;
    /**
     * Update session agent state
     * @param handler - Handler function that returns the updated agent state
     */
    updateAgentState(handler: (metadata: AgentState) => AgentState): void;
    /**
     * Wait for socket buffer to flush
     */
    flush(): Promise<void>;
    close(): Promise<void>;
    private startSmartReconnect;
}

interface SpawnSessionOptions {
    machineId?: string;
    directory: string;
    sessionId?: string;
    approvedNewDirectoryCreation?: boolean;
    agent?: 'claude' | 'codex' | 'gemini' | 'openclaw';
    environmentVariables?: Record<string, string>;
    token?: string;
}
type SpawnSessionResult = {
    type: 'success';
    sessionId: string;
} | {
    type: 'requestToApproveDirectoryCreation';
    directory: string;
} | {
    type: 'error';
    errorMessage: string;
};

/**
 * WebSocket client for machine/daemon communication with Happy server
 * Similar to ApiSessionClient but for machine-scoped connections
 */

type MachineRpcHandlers = {
    spawnSession: (options: SpawnSessionOptions) => Promise<SpawnSessionResult>;
    resumeSession?: (sessionId: string, options?: {
        model?: string;
        permissionMode?: string;
    }) => Promise<SpawnSessionResult>;
    stopSession: (sessionId: string) => boolean;
    requestShutdown: () => void;
};
declare class ApiMachineClient {
    private token;
    private machine;
    private socket;
    private keepAliveInterval;
    private lastKnownCLIAvailability;
    private lastKnownResumeSupport;
    private rpcHandlerManager;
    private resumeSessionHandler;
    private reconnectInterval;
    constructor(token: string, machine: Machine);
    setRPCHandlers({ spawnSession, resumeSession, stopSession, requestShutdown }: MachineRpcHandlers): void;
    private syncResumeSessionRpcRegistration;
    /**
     * Update machine metadata
     * Currently unused, changes from the mobile client are more likely
     * for example to set a custom name.
     */
    updateMachineMetadata(handler: (metadata: MachineMetadata | null) => MachineMetadata): Promise<void>;
    /**
     * Update daemon state (runtime info) - similar to session updateAgentState
     * Simplified without lock - relies on backoff for retry
     */
    updateDaemonState(handler: (state: DaemonState | null) => DaemonState): Promise<void>;
    connect(): void;
    private startKeepAlive;
    private startSmartReconnect;
    private stopKeepAlive;
    shutdown(): void;
}

interface PushToken {
    id: string;
    token: string;
    createdAt: number;
    updatedAt: number;
}
type SessionNotificationKind = 'done' | 'permission' | 'question';
declare class PushNotificationClient {
    private readonly token;
    private readonly baseUrl;
    private readonly expo;
    constructor(token: string, baseUrl?: string);
    /**
     * Fetch all push tokens for the authenticated user.
     * Retries up to 3 times with exponential backoff on transient errors.
     */
    fetchPushTokens(): Promise<PushToken[]>;
    /**
     * Send push notification via Expo Push API with retry
     * @param messages - Array of push messages to send
     */
    sendPushNotifications(messages: ExpoPushMessage[]): Promise<void>;
    /**
     * Send a push notification to all registered devices for the user
     * @param title - Notification title
     * @param body - Notification body
     * @param data - Additional data to send with the notification
     */
    sendToAllDevices(title: string, body?: string, data?: Record<string, any>): void;
    sendSessionNotification(params: {
        kind: SessionNotificationKind;
        metadata: Metadata | null | undefined;
        data?: Record<string, any>;
    }): void;
}

declare class ApiClient {
    static create(credential: Credentials): Promise<ApiClient>;
    private readonly credential;
    private readonly pushClient;
    private constructor();
    /**
     * Create a new session or load existing one with the given tag
     */
    getOrCreateSession(opts: {
        tag: string;
        metadata: Metadata;
        state: AgentState | null;
    }): Promise<Session | null>;
    /**
     * Register or update machine with the server
     * Returns the current machine state from the server with decrypted metadata and daemonState
     */
    getOrCreateMachine(opts: {
        machineId: string;
        metadata: MachineMetadata;
        daemonState?: DaemonState;
    }): Promise<Machine>;
    sessionSyncClient(session: Session): ApiSessionClient;
    machineSyncClient(machine: Machine): ApiMachineClient;
    push(): PushNotificationClient;
    /**
     * Register a vendor API token with the server
     * The token is sent as a JSON string - server handles encryption
     */
    registerVendorToken(vendor: 'openai' | 'anthropic' | 'gemini', apiKey: any): Promise<void>;
    /**
     * Get vendor API token from the server
     * Returns the token if it exists, null otherwise
     */
    getVendorToken(vendor: 'openai' | 'anthropic' | 'gemini'): Promise<any | null>;
}

/**
 * Design decisions:
 * - Logging should be done only through file for debugging, otherwise we might disturb the claude session when in interactive mode
 * - Use info for logs that are useful to the user - this is our UI
 * - File output location: ~/.handy/logs/<date time in local timezone>.log
 */
declare class Logger {
    readonly logFilePath: string;
    private dangerouslyUnencryptedServerLoggingUrl;
    constructor(logFilePath?: string);
    localTimezoneTimestamp(): string;
    debug(message: string, ...args: unknown[]): void;
    debugLargeJson(message: string, object: unknown, maxStringLength?: number, maxArrayLength?: number): void;
    info(message: string, ...args: unknown[]): void;
    infoDeveloper(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    getLogPath(): string;
    private logToConsole;
    private sendToRemoteServer;
    private logToFile;
}
declare let logger: Logger;

/**
 * Global configuration for happy CLI
 *
 * Centralizes all configuration including environment variables and paths
 * Environment files should be loaded using Node's --env-file flag
 */
declare class Configuration {
    readonly serverUrl: string;
    readonly webappUrl: string;
    readonly isDaemonProcess: boolean;
    readonly happyHomeDir: string;
    readonly logsDir: string;
    readonly settingsFile: string;
    readonly privateKeyFile: string;
    readonly daemonStateFile: string;
    readonly daemonLockFile: string;
    readonly sessionsFile: string;
    readonly currentCliVersion: string;
    readonly isExperimentalEnabled: boolean;
    readonly disableCaffeinate: boolean;
    constructor();
}
declare const configuration: Configuration;

export { ApiClient, ApiSessionClient, RawJSONLinesSchema, configuration, logger };
export type { RawJSONLines };
