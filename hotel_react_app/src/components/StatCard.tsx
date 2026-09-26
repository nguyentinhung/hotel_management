interface StatCardProps {
  title: string;
  value: number | string;
}

export default function StatCard({ title, value }: StatCardProps) {
  return (
    <div className="stat-card card">
      <h3>{title}</h3>
      <strong>{value}</strong>
    </div>
  );
}
