import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";

interface SystemStatus {
  derivConnected: boolean;
  activeSessions: number;
  renderServiceReady: boolean;
  uptime: number;
}

export default function Home() {
  const { data: status } = useQuery<SystemStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 5000,
  });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Trading Signal Bot</CardTitle>
          <CardDescription>
            Algorithmic trading signals via Telegram
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            <p className="text-muted-foreground">
              This bot provides real-time trading signals with 35+ technical indicators
              and candlestick pattern analysis.
            </p>
            <p className="text-sm text-muted-foreground">
              Open Telegram and search for your bot to start receiving signals.
            </p>
          </div>
          
          {status && (
            <div className="border rounded-md p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deriv Connection</span>
                <span className={status.derivConnected ? "text-green-500" : "text-red-500"}>
                  {status.derivConnected ? "Connected" : "Disconnected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Active Sessions</span>
                <span>{status.activeSessions}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Chart Rendering</span>
                <span className={status.renderServiceReady ? "text-green-500" : "text-yellow-500"}>
                  {status.renderServiceReady ? "Ready" : "Text-only"}
                </span>
              </div>
            </div>
          )}

          <div className="text-center">
            <Button
              variant="default"
              size="lg"
              onClick={() => window.open("https://t.me/", "_blank")}
              data-testid="button-open-telegram"
            >
              Open Telegram
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
