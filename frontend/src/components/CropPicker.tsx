import { FilterSelect } from "@/components/FilterSelect";
import { switchCrop, useCrop } from "@/lib/crops";

/** The crop picker: "All crops" plus each Production Crop. It filters the dashboard and every page. */
export function CropPicker() {
  const { cropKey, crops } = useCrop();
  if (!crops.length) return null;
  return (
    <FilterSelect
      label="Crop"
      value={cropKey}
      onChange={switchCrop}
      allLabel="All crops"
      options={crops.map((c) => ({ value: c.crop_key, label: c.name }))}
    />
  );
}
