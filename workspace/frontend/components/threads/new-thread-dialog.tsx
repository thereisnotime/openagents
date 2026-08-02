'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/responsive-dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { History, Check, Minus, Users, ClipboardCheck } from 'lucide-react';
import type { WorkspaceAgent, WorkspaceSession } from '@/lib/types';
import { AgentAvatar } from '@/components/agents/agent-avatar';

interface NewThreadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: WorkspaceAgent[];
  sessions?: WorkspaceSession[];
  onCreateThread: (opts: {
    participants: string[];
    resumeFrom?: string;
    phase?: string;
    phaseOwner?: string;
  }) => void;
}

/**
 * Who should own the clarification phase for a set of selected agents.
 *
 * The workspace master is the only coordinator signal the system actually
 * has, so it is preselected when it is among the participants. Otherwise the
 * user picks: guessing would often land on the agent that builds things, and
 * a gate whose owner is the builder is no gate at all.
 */
function defaultClarifyOwner(agents: WorkspaceAgent[], selected: Set<string>): string {
  const master = agents.find((a) => selected.has(a.agentName) && a.role === 'master');
  return master ? master.agentName : '';
}

export function NewThreadDialog({ open, onOpenChange, agents, sessions, onCreateThread }: NewThreadDialogProps) {
  // Only show online agents in the picker
  const onlineAgents = agents.filter((a) => a.status === 'online');
  const offlineAgentCount = agents.length - onlineAgents.length;
  const agentNames = onlineAgents.map((a) => a.agentName);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resumeFrom, setResumeFrom] = useState<string>('');
  // Multi-agent threads start in clarification by default: without it the
  // router hands the first underspecified request straight to whichever agent
  // matches the topic, which is how an RD agent ends up writing code before
  // the requirement exists.
  const [clarifyFirst, setClarifyFirst] = useState(true);
  const [clarifyOwner, setClarifyOwner] = useState<string>('');

  const isAllSelected = onlineAgents.length > 0 && selected.size === onlineAgents.length;
  const isPartiallySelected = selected.size > 0 && selected.size < onlineAgents.length;

  const toggleAll = () => {
    setSelected(isAllSelected ? new Set() : new Set(agentNames));
  };

  // Reset state when dialog opens. When there's exactly one online agent,
  // pre-select it so the common single-agent case is a one-click "Start Thread".
  useEffect(() => {
    if (open) {
      const initial = onlineAgents.length === 1
        ? new Set([onlineAgents[0].agentName])
        : new Set<string>();
      setSelected(initial);
      setResumeFrom('');
      setClarifyFirst(true);
      setClarifyOwner(defaultClarifyOwner(onlineAgents, initial));
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The owner must be one of the participants. Re-derive whenever the
  // selection changes so deselecting the chosen owner cannot leave a stale
  // name that the backend would reject on submit.
  useEffect(() => {
    setClarifyOwner((prev) =>
      prev && selected.has(prev) ? prev : defaultClarifyOwner(onlineAgents, selected)
    );
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleAgent = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  };

  // A gate only means anything once two agents can compete for the floor.
  const showClarifyOption = selected.size >= 2;
  // Checked but no owner chosen: the backend refuses a gate nobody holds, so
  // block here rather than let the create fail after the dialog closes.
  const needsOwner = showClarifyOption && clarifyFirst && !clarifyOwner;

  const handleCreate = () => {
    // No leader is assigned at creation — the default "dynamic" mode doesn't
    // need one. A leader can be set later from the thread's agent menu (and is
    // only required by "master" orchestration mode).
    const participants = agentNames.filter((n) => selected.has(n));
    // The phase travels with the create event rather than a PATCH afterwards:
    // a thread that is ungated for even a moment can have its first message
    // routed to a builder before the gate lands.
    const gated = showClarifyOption && clarifyFirst && !!clarifyOwner;
    onCreateThread({
      participants,
      resumeFrom: resumeFrom || undefined,
      ...(gated && { phase: 'clarifying', phaseOwner: clarifyOwner }),
    });
    onOpenChange(false);
  };

  // Filter sessions that have messages (lastEventAt != null) for resume picker
  const resumableSessions = (sessions || []).filter(
    (s) => s.status === 'active' && s.lastEventAt != null
  );

  // Check if any selected agent is a Claude Code agent (heuristic: agent type or name contains 'claude')
  const hasClaudeAgent = onlineAgents.some(
    (a) => selected.has(a.agentName) && /claude/i.test(a.agentName)
  );

  const multipleAgents = onlineAgents.length > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Thread</DialogTitle>
          <DialogDescription>
            {multipleAgents
              ? 'Pick which agents join this conversation.'
              : 'Start a new conversation with your agent.'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-2 py-1">
          {/* Select All Control */}
          {onlineAgents.length > 0 && (
            <button
              type="button"
              className="flex w-full items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer text-left transition-colors hover:bg-muted/60"
              onClick={toggleAll}
            >
              <div className={cn(
                'size-4 rounded-sm shrink-0 flex items-center justify-center border transition-colors',
                isAllSelected || isPartiallySelected
                  ? 'bg-primary border-primary text-primary-foreground'
                  : 'border-input'
              )}>
                {isAllSelected && <Check className="size-3" strokeWidth={3} />}
                {isPartiallySelected && <Minus className="size-3" strokeWidth={3} />}
              </div>
              <span className="text-sm font-medium">
                {isAllSelected
                  ? 'All agents selected'
                  : isPartiallySelected
                    ? `${selected.size} of ${onlineAgents.length} agents selected`
                    : 'Select all agents'}
              </span>
            </button>
          )}
          {offlineAgentCount > 0 && (
            <p className="px-3 text-[11px] text-muted-foreground/70">
              {offlineAgentCount} offline {offlineAgentCount === 1 ? 'agent' : 'agents'} not included
            </p>
          )}

          {/* Agent list */}
          {onlineAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <div className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Users className="size-5" />
              </div>
              <p className="text-sm text-muted-foreground">No agents are currently online.</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {onlineAgents.map((agent) => {
                const isSelected = selected.has(agent.agentName);

                return (
                  <div
                    key={agent.agentName}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer transition-all border',
                      isSelected
                        ? 'bg-muted/50 border-border'
                        : 'border-transparent opacity-60 hover:opacity-100 hover:bg-muted/40'
                    )}
                    onClick={() => toggleAgent(agent.agentName)}
                  >
                    {/* Checkbox */}
                    <div className={cn(
                      'size-4 rounded-sm shrink-0 flex items-center justify-center border transition-colors',
                      isSelected
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-input'
                    )}>
                      {isSelected && <Check className="size-3" strokeWidth={3} />}
                    </div>

                    {/* Avatar */}
                    <AgentAvatar name={agent.agentName} size={24} />

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium truncate">{agent.agentName}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Clarify-first gate — multi-agent threads only */}
          {showClarifyOption && (
            <div className="pt-1 space-y-2">
              <button
                type="button"
                className="flex w-full items-start gap-2.5 px-3 py-2 rounded-md cursor-pointer text-left transition-colors hover:bg-muted/60"
                onClick={() => setClarifyFirst((v) => !v)}
              >
                <div className={cn(
                  'size-4 mt-0.5 rounded-sm shrink-0 flex items-center justify-center border transition-colors',
                  clarifyFirst
                    ? 'bg-primary border-primary text-primary-foreground'
                    : 'border-input'
                )}>
                  {clarifyFirst && <Check className="size-3" strokeWidth={3} />}
                </div>
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <ClipboardCheck className="size-3.5" />
                    Clarify requirements before execution
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                    Recommended. One agent owns the requirement until you confirm it —
                    the others can be asked for input but cannot start building.
                  </p>
                </div>
              </button>

              {clarifyFirst && (
                <div className="px-3">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Who owns the requirement?
                  </label>
                  <select
                    value={clarifyOwner}
                    onChange={(e) => setClarifyOwner(e.target.value)}
                    className={cn(
                      'w-full h-8.5 text-[0.8125rem] rounded-md border bg-background px-3 shadow-xs shadow-black/5 transition-[color,box-shadow] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30',
                      needsOwner ? 'border-destructive' : 'border-input'
                    )}
                  >
                    <option value="">Select an agent…</option>
                    {onlineAgents
                      .filter((a) => selected.has(a.agentName))
                      .map((a) => (
                        <option key={a.agentName} value={a.agentName}>
                          {a.agentName}{a.role === 'master' ? ' (workspace leader)' : ''}
                        </option>
                      ))}
                  </select>
                  {needsOwner && (
                    <p className="text-[11px] text-destructive mt-1">
                      Pick the agent that owns the requirement, or uncheck the option above.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resume from past session — show when there are resumable sessions */}
          {hasClaudeAgent && resumableSessions.length > 0 && (
            <div className="pt-1">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
                <History className="size-3" />
                Resume from past session
              </label>
              <select
                value={resumeFrom}
                onChange={(e) => setResumeFrom(e.target.value)}
                className="w-full h-8.5 text-[0.8125rem] rounded-md border border-input bg-background px-3 shadow-xs shadow-black/5 transition-[color,box-shadow] focus-visible:outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              >
                <option value="">New conversation (no context)</option>
                {resumableSessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.title || s.sessionId}
                  </option>
                ))}
              </select>
            </div>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={selected.size === 0 || needsOwner}>
            {resumeFrom ? 'Resume Thread' : 'Start Thread'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
