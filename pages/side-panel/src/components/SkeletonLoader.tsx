const SkeletonLoader = () => (
  <div className="animate-pulse space-y-4">
    {/* Color swatch skeletons */}
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }} />
      ))}
    </div>
    {/* Text skeletons */}
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-8 rounded"
          style={{ width: `${80 - i * 10}%`, backgroundColor: 'var(--bg-secondary)' }}
        />
      ))}
    </div>
  </div>
);

export { SkeletonLoader };
