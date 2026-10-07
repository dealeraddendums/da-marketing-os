// "Make this a ticket" — HubSpot contact-record card for Steven chats.
//
// The classic Conversations inbox has no slot for app cards, so the agent
// opens the contact from the chat; this card lists that contact's recent
// chats (website + DA Platform) with one button each. Ticket creation runs on
// our server (signed hubspot.fetch → www.dealeraddendums.com) and is
// idempotent: a chat can only ever become one ticket.
import React, { useCallback, useEffect, useState } from "react";
import {
  hubspot, Alert, Button, Divider, Flex, Link, LoadingSpinner, Tag, Text,
} from "@hubspot/ui-extensions";

const BASE = "https://www.dealeraddendums.com/api/hubspot-chat/card";
const PORTAL = "23896347";

hubspot.extend(({ context }) => <StevenChats context={context} />);

function when(iso) {
  try { return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return ""; }
}

function StevenChats({ context }) {
  const contactId = String(context.crm.objectId);
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await hubspot.fetch(`${BASE}/chats`, { method: "POST", body: { contactId } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setChats(j.chats || []);
      if (j.platformError) setNotice(j.platformError);
    } catch (e) {
      setError(`Couldn't load chats: ${e.message || e}`);
      setChats([]);
    }
  }, [contactId]);

  useEffect(() => { load(); }, [load]);

  const makeTicket = async (chat) => {
    setBusyId(chat.id);
    setError(null);
    setNotice(null);
    try {
      const r = await hubspot.fetch(`${BASE}/make-ticket`, {
        method: "POST",
        body: { surface: chat.surface, conversationId: chat.id, contactId },
        timeout: 60000,
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setNotice(j.existing ? `This chat is already ticket #${j.ticketId}.` : `Ticket #${j.ticketId} created.`);
      await load();
    } catch (e) {
      setError(`Couldn't create the ticket: ${e.message || e}`);
    } finally {
      setBusyId(null);
    }
  };

  if (chats === null) return <LoadingSpinner label="Loading Steven chats…" />;

  return (
    <Flex direction="column" gap="sm">
      {error && <Alert title="Something went wrong" variant="danger">{error}</Alert>}
      {notice && <Alert title="Done" variant="success">{notice}</Alert>}
      {chats.length === 0 && <Text>No Steven chats for this contact yet.</Text>}
      {chats.map((c, i) => (
        <Flex key={`${c.surface}-${c.id}`} direction="column" gap="xs">
          {i > 0 && <Divider />}
          <Flex direction="row" gap="xs" align="center">
            <Tag variant={c.surface === "inapp" ? "info" : "default"}>{c.surface === "inapp" ? "DA Platform" : "Website"}</Tag>
            <Text variant="microcopy">{when(c.startedAt)}{c.dealership ? ` · ${c.dealership}` : ""}</Text>
          </Flex>
          <Text>{c.preview}</Text>
          {c.ticketId ? (
            <Link href={`https://app.hubspot.com/contacts/${PORTAL}/record/0-5/${c.ticketId}`}>Ticket #{c.ticketId}</Link>
          ) : (
            <Button size="small" variant="secondary" disabled={!!busyId} onClick={() => makeTicket(c)}>
              {busyId === c.id ? "Creating…" : "Make this a ticket"}
            </Button>
          )}
        </Flex>
      ))}
      <Button size="small" variant="transparent" onClick={load}>Refresh</Button>
    </Flex>
  );
}
