export default async function TestLoadingPage() {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  return (
    <div className="flex h-full items-center justify-center">
      <h1 className="text-2xl font-bold">Loading Test Complete</h1>
    </div>
  );
}
