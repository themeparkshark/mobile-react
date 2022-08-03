import { Button, SafeAreaView, TextInput } from 'react-native';
import { useLayoutEffect, useContext, useState } from 'react';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import updateUser from '../../api/endpoints/me/update';
import { AuthContext} from '../../context/AuthProvider';

export default function UpdateEmailScreen({ navigation }) {
  const { user } = useContext(AuthContext);
  const [canSubmit, setCanSubmit] = useState(false);
  const [email, setEmail] = useState(user.email);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Button
          disabled={!canSubmit}
          title="Done"
          onPress={async () => {
            setCanSubmit(false);

            try {
              await updateUser({
                email,
              });
            } catch {
              setCanSubmit(true);

              return false;
            }

            navigation.goBack();
          }}
        />
      ),
    });
  }, [navigation, email, canSubmit]);

  return (
    <SafeAreaView>
      <TableView>
        <Section>
          <Cell
            cellContentView={
              <TextInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  setCanSubmit(true);
                }}
              />
            }
          />
        </Section>
      </TableView>
    </SafeAreaView>
  )
};
