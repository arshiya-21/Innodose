import { Button, Icon } from '@/components/ui';

/** Edit / Delete / Add New … buttons above the configuration tables (36px, design-file icons). */
export function Toolbar({ selected, onEdit, onDelete, onAdd, addLabel, disabled }: { selected: number; onEdit: () => void; onDelete: () => void; onAdd: () => void; addLabel: string; disabled?: boolean }) {
  const why = disabled ? 'Supervisor access is needed to change configuration.' : undefined;
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" size="lg" disabled={disabled || selected !== 1} onClick={onEdit} icon={<Icon name="edit" size={20} />} title={why}>Edit</Button>
      <Button variant="danger" size="lg" disabled={disabled || selected === 0} onClick={onDelete} icon={<Icon name="delete" size={20} />} title={why}>Delete</Button>
      <Button variant="primary" size="lg" className="ml-auto" disabled={disabled} onClick={onAdd} icon={<Icon name="plus" size={20} />} title={why}>{addLabel}</Button>
    </div>
  );
}
