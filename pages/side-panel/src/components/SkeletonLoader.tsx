const SkeletonLoader = () => (
  <div className="animate-pulse space-y-4">
    {/* Color swatch skeletons */}
    <div className="grid grid-cols-4 gap-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-14 rounded-lg bg-gray-200" />
      ))}
    </div>
    {/* Text skeletons */}
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-8 rounded bg-gray-200" style={{ width: `${80 - i * 10}%` }} />
      ))}
    </div>
  </div>
);

export { SkeletonLoader };
