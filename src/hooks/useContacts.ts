import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
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

  // Sync contacts from phone (native only)
  const syncFromPhone = useCallback(async () => {
    if (!userId) {
      toast.error("Please sign in first!");
      return;
    }

    if (!Capacitor.isNativePlatform()) {
      toast.error("Contact sync requires the native app");
      return;
    }

    setSyncing(true);
    try {
      const { Contacts } = await import("@capacitor-community/contacts");

      const permission = await Contacts.requestPermissions();
      if (permission.contacts !== "granted") {
        toast.error("Contact permission denied");
        setSyncing(false);
        return;
      }

      const result = await Contacts.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
        },
      });

      const phoneContacts = result.contacts || [];
      if (!phoneContacts.length) {
        toast("No contacts found on your phone", { duration: 3000 });
        setSyncing(false);
        return;
      }

      // Transform to our format
      const transformed = phoneContacts
        .filter((c: any) => c.name?.display && c.phones?.length)
        .map((c: any) => ({
          name: c.name.display,
          phone_numbers: (c.phones || []).map((p: any) => p.number?.replace(/\s/g, "") || "").filter(Boolean),
          email_addresses: (c.emails || []).map((e: any) => e.address || "").filter(Boolean),
          user_id: userId,
        }));

      if (!transformed.length) {
        toast("No contacts with phone numbers found", { duration: 3000 });
        setSyncing(false);
        return;
      }

      // Delete existing contacts and bulk insert
      await supabase.from("user_contacts").delete().eq("user_id", userId);

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < transformed.length; i += batchSize) {
        const batch = transformed.slice(i, i + batchSize);
        const { error } = await supabase.from("user_contacts").insert(batch);
        if (error) {
          console.error("Batch insert error:", error);
          throw error;
        }
      }

      // Reload
      loadedRef.current = false;
      await loadContacts();
      toast.success(`✨ Synced ${transformed.length} contacts!`);
    } catch (e) {
      console.error("Contact sync error:", e);
      toast.error("Failed to sync contacts");
    } finally {
      setSyncing(false);
    }
  }, [userId, loadContacts]);

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
    syncFromPhone,
    searchContacts,
  };
}
