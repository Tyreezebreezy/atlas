interface EmptyScreenProps {
  title: string;
  description: string;
}

export function EmptyScreen({ title, description }: EmptyScreenProps) {
  return (
    <div className="atlas-empty-screen">
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
  );
}
