import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface UserContact {
  id: string;
  name: string;
  phone_numbers: string[];
  email_addresses: string[];
}

export function useContacts(userId: string | null) {
  const [contacts, setContacts] = useState<UserContact[]>([]);
  const [syncing, setSyncing] = useState(false);
  const loadedRef = useRef(false);

  // Load contacts from DB
  const loadContacts = useCallback(async () => {
    if (!userId || loadedRef.current) return;
    try {
      const { data, error } = await supabase
        .from("user_contacts")
        .select("id, name, phone_numbers, email_addresses")
        .eq("user_id", userId)
        .order("name");
      if (error) throw error;
      setContacts((data as UserContact[]) || []);
      loadedRef.current = true;
    } catch (e) {
      console.error("Failed to load contacts:", e);
    }
  }, [userId]);

  // Get a valid Google access token (refreshing if needed)
  const getGoogleToken = useCallback(async (): Promise<string | null> => {
    if (!userId) return null;
    try {
      const { data: tokenRow } = await supabase
        .from("user_google_tokens")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (!tokenRow) return null;

      const isExpired = new Date(tokenRow.token_expires_at) <= new Date();
      if (!isExpired) return tokenRow.access_token;

      // Refresh the token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return null;

      const refreshRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aori-google-oauth`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
        }
      );
      const refreshData = await refreshRes.json();
      if (refreshRes.ok) return refreshData.access_token;
      return null;
    } catch (e) {
      console.error("Failed to get Google token:", e);
      return null;
    }
  }, [userId]);

  // Sync contacts from Google Contacts API
  const syncFromGoogle = useCallback(async () => {
    if (!userId) {
      toast.error("Please sign in first!");
      return;
    }

    setSyncing(true);
    try {
      const accessToken = await getGoogleToken();
      if (!accessToken) {
        toast.error("Connect Google first! Go to Setup Guide → Google");
        setSyncing(false);
        return;
      }

      // Fetch all contacts (paginated)
      let allContacts: { name: string; phone_numbers: string[]; email_addresses: string[] }[] = [];
      let nextPageToken: string | null = null;

      do {
        const { data, error } = await supabase.functions.invoke("aori-contacts", {
          body: { accessToken, pageToken: nextPageToken, pageSize: 200 },
        });

        if (error) throw error;
        if (data.contacts) allContacts = [...allContacts, ...data.contacts];
        nextPageToken = data.nextPageToken;
      } while (nextPageToken);

      if (!allContacts.length) {
        toast("No contacts with phone numbers found in Google", { duration: 3000 });
        setSyncing(false);
        return;
      }

      // Delete existing contacts and bulk insert
      await supabase.from("user_contacts").delete().eq("user_id", userId);

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < allContacts.length; i += batchSize) {
        const batch = allContacts.slice(i, i + batchSize).map((c) => ({
          ...c,
          user_id: userId,
        }));
        const { error } = await supabase.from("user_contacts").insert(batch);
        if (error) {
          console.error("Batch insert error:", error);
          throw error;
        }
      }

      // Reload
      loadedRef.current = false;
      await loadContacts();
      toast.success(`✨ Synced ${allContacts.length} contacts from Google!`);
    } catch (e) {
      console.error("Google contact sync error:", e);
      toast.error("Failed to sync contacts from Google");
    } finally {
      setSyncing(false);
    }
  }, [userId, getGoogleToken, loadContacts]);

  // Search contacts by name (fuzzy)
  const searchContacts = useCallback((query: string): UserContact[] => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    return contacts.filter((c) =>
      c.name.toLowerCase().includes(q)
    );
  }, [contacts]);

  return {
    contacts,
    syncing,
    loadContacts,
    syncFromGoogle,
    searchContacts,
  };
}
