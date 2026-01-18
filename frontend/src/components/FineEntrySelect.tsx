import { useState, useEffect } from 'react';
import { supabaseDex, type DexEntry } from '../lib/supabaseDex';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { rarityToSet, getSetColor } from '../utils/sanitizeCopy';
import { Search } from 'lucide-react';

interface FineEntrySelectProps {
  coarseLabelId: number;
  versionId?: string;
  value: number | null;
  onChange: (entryId: number) => void;
  disabled?: boolean;
}

export function FineEntrySelect({
  coarseLabelId,
  versionId = 'v0',
  value,
  onChange,
  disabled,
}: FineEntrySelectProps) {
  const [entries, setEntries] = useState<DexEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadEntries();
  }, [coarseLabelId, versionId]);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const data = await supabaseDex.getDexEntries(versionId, {
        coarseLabelId,
      });
      setEntries(data);
    } catch (error) {
      console.error('Error loading entries:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = entries.filter((e) =>
    e.fine_label.toLowerCase().includes(searchQuery.toLowerCase())
  );


  return (
    <Card>
      <CardContent className="p-0">
        <Command className="rounded-lg border-0">
          <CommandInput
            placeholder="Search for specific item..."
            value={searchQuery}
            onValueChange={setSearchQuery}
          />
          <CommandList className="max-h-[300px]">
            {loading ? (
              <div className="py-6 text-center text-sm text-gray-500">Loading...</div>
            ) : filteredEntries.length === 0 ? (
              <CommandEmpty>No entries found.</CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredEntries.map((entry) => (
                  <CommandItem
                    key={entry.id}
                    value={entry.fine_label}
                    onSelect={() => !disabled && onChange(entry.id)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{entry.fine_label}</span>
                      <Badge className={getSetColor(entry.rarity)}>
                        {rarityToSet(entry.rarity)}
                      </Badge>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CardContent>
    </Card>
  );
}
