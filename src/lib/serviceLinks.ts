export type EditableServiceFields = {
  title: string;
  price?: string;
  durationMinutes?: number;
  description?: string;
  imageUrl?: string;
  category?: string;
};

type ServiceLink = EditableServiceFields & {
  type: string;
};

export const updateServiceAtIndex = <T extends ServiceLink>(
  links: readonly T[],
  index: number,
  updates: EditableServiceFields,
): T[] => {
  if (!Number.isInteger(index) || index < 0 || index >= links.length) {
    throw new Error("Serviço selecionado não existe.");
  }
  if (links[index].type !== "service") {
    throw new Error("Item selecionado não é um serviço.");
  }

  return links.map((link, currentIndex) =>
    currentIndex === index ? { ...link, ...updates } : link,
  );
};
